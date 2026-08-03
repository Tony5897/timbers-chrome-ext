const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  deleteDoc,
  doc,
  getDoc,
  increment,
  setDoc,
  setLogLevel,
  updateDoc,
} = require('firebase/firestore');

setLogLevel('silent');

const hostAndPort = process.env.FIRESTORE_EMULATOR_HOST?.split(':') ?? ['127.0.0.1', '8080'];
const host = hostAndPort[0];
const port = Number(hostAndPort[1]);
let temporaryEnvironment;
let finalEnvironment;

beforeAll(async () => {
  temporaryEnvironment = await initializeTestEnvironment({
    projectId: 'demo-timbers-matchday-temporary',
    firestore: {
      host,
      port,
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
    },
  });
  finalEnvironment = await initializeTestEnvironment({
    projectId: 'demo-timbers-matchday-final',
    firestore: {
      host,
      port,
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules.final'), 'utf8'),
    },
  });
});

afterEach(async () => {
  if (temporaryEnvironment) await temporaryEnvironment.clearFirestore();
  if (finalEnvironment) await finalEnvironment.clearFirestore();
});

afterAll(async () => {
  if (temporaryEnvironment) await temporaryEnvironment.cleanup();
  if (finalEnvironment) await finalEnvironment.cleanup();
});

describe('temporary legacy compatibility rules', () => {
  function publicVote(reference = '1786156200000') {
    return doc(temporaryEnvironment.unauthenticatedContext().firestore(), 'votes', reference);
  }

  async function seedVote(data = { high: 2, medium: 1, low: 0 }) {
    await temporaryEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'votes', '1786156200000'), data);
    });
  }

  test('keeps legacy aggregate reads public', async () => {
    await assertSucceeds(getDoc(publicVote()));
  });

  test.each(['high', 'medium', 'low'])('allows a one-count %s document creation', async (choice) => {
    await assertSucceeds(setDoc(publicVote(), { [choice]: increment(1) }, { merge: true }));
  });

  test('denies arbitrary or multi-choice creation', async () => {
    await assertFails(setDoc(publicVote('1786156200001'), { high: 100 }));
    await assertFails(setDoc(publicVote('1786156200002'), { high: 1, medium: 1 }));
    await assertFails(setDoc(publicVote('1786156200003'), { high: 1, injected: 1 }));
  });

  test.each(['high', 'medium', 'low'])('allows exactly one resulting +1 to %s', async (choice) => {
    await seedVote();
    await assertSucceeds(updateDoc(publicVote(), { [choice]: increment(1) }));
  });

  test('denies increments other than one and multi-choice changes', async () => {
    await seedVote();
    await assertFails(updateDoc(publicVote(), { high: increment(2) }));
    await assertFails(updateDoc(publicVote(), { high: increment(-1) }));
    await assertFails(updateDoc(publicVote(), { high: increment(1), low: increment(1) }));
  });

  test('denies field injection, replacement, and deletion', async () => {
    await seedVote();
    await assertFails(updateDoc(publicVote(), { injected: 1 }));
    await assertFails(setDoc(publicVote(), { high: 100, medium: 0, low: 0 }));
    await assertFails(deleteDoc(publicVote()));
  });

  test('denies every unrelated collection', async () => {
    const unrelated = doc(temporaryEnvironment.unauthenticatedContext().firestore(), 'installations', 'attacker');
    await assertFails(getDoc(unrelated));
    await assertFails(setDoc(unrelated, { enabled: true }));
  });
});

describe('final post-grace rules', () => {
  function publicVote() {
    return doc(finalEnvironment.unauthenticatedContext().firestore(), 'votes', '1786156200000');
  }

  test('keeps legacy aggregate reads available', async () => {
    await assertSucceeds(getDoc(publicVote()));
  });

  test('denies every public legacy write', async () => {
    await assertFails(setDoc(publicVote(), { high: increment(1) }, { merge: true }));
    await assertFails(deleteDoc(publicVote()));
  });

  test('denies reads and writes outside the legacy aggregate collection', async () => {
    const rawResponse = doc(
      finalEnvironment.unauthenticatedContext().firestore(),
      'compatibilityPolls',
      'poll',
      'responses',
      'uid',
    );
    await assertFails(getDoc(rawResponse));
    await assertFails(setDoc(rawResponse, { choice: 'high' }));
  });
});

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'calori1300' });
(async () => {
  try {
    const userRec = await admin.auth().getUserByEmail('turhv124@gmail.com');
    const uid = userRec.uid;
    console.log('UID:', uid);
    const db = admin.firestore();
    const integ = await db.collection('users').doc(uid).collection('integrations').doc('google').get();
    console.log('google token doc exists:', integ.exists);
    if (integ.exists) {
      const t = integ.data();
      console.log('  has access_token:', !!t.access_token);
      console.log('  has refresh_token:', !!t.refresh_token);
      console.log('  scope:', t.scope);
      console.log('  expiry_date:', t.expiry_date, '(now:', Date.now(), ')');
    }
    const set = await db.collection('users').doc(uid).collection('integrations').doc('google_settings').get();
    console.log('google_settings doc exists:', set.exists);
    if (set.exists) console.log('  settings:', set.data());
    const today = new Date().toISOString().slice(0, 10);
    const sched = await db.collection('users').doc(uid).collection('cl_schedule').doc(today).get();
    console.log(`cl_schedule/${today} exists:`, sched.exists);
    if (sched.exists) {
      const s = sched.data();
      console.log('  blocks:', s.blocks?.length);
      console.log('  types:', (s.blocks||[]).map(b => `${b.type}@${b.startTime}-${b.endTime}`).join(', '));
    }
    process.exit(0);
  } catch (e) { console.error('ERR', e.message, e.code); process.exit(1); }
})();

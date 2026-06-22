import admin from 'firebase-admin';
import fs from 'fs';

const SERVICE_ACCOUNT_PATH = 'C:\\src\\projects\\calori_1300\\firebase-key.json.json';
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function run() {
  const email = 'e2e-test-user@calori.life';
  const password = 'Password123!';
  const uid = 'e2etestuseruid123456789';

  try {
    // Check if user exists
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
      console.log(`User already exists: ${user.uid}`);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        user = await admin.auth().createUser({
          uid,
          email,
          password,
          displayName: 'E2E Tester',
        });
        console.log(`Created user: ${user.uid}`);
      } else {
        throw err;
      }
    }

    // Ensure the user has the default categories and at least one course so onboarding is bypassed
    const db = admin.firestore();
    
    // Create profile
    await db.collection('users').doc(uid).collection('cl_profile').doc('main').set({
      displayName: 'E2E Tester',
      academicYear: "שנה א'",
      semester: "סמסטר א'",
      wakeTime: '07:00',
      sleepTime: '23:00',
      lastCoachShownDate: '',
      coachOverlayDismissedDate: '',
      hasCompletedOnboarding: true,
    });

    // Create default categories
    const categories = [
      { id: 'studies', name: 'לימודים', color: 'var(--blue)', icon: 'Book', scope: 'global' },
      { id: 'work', name: 'עבודה', color: 'var(--orange)', icon: 'Briefcase', scope: 'global' },
      { id: 'personal', name: 'אישי', color: 'var(--green)', icon: 'User', scope: 'global' },
      { id: 'Health', name: 'בריאות', color: 'var(--red)', icon: 'Heart', scope: 'global' },
    ];
    for (const cat of categories) {
      await db.collection('users').doc(uid).collection('cl_categories').doc(cat.id).set(cat);
    }

    // Create default courses
    const defaultCourses = [
      {
        id: 'infi2',
        name: "אינפי 2",
        weeksCount: 12,
        exams: { moedA: null, moedB: null, moedC: null }
      },
      {
        id: 'linear2',
        name: "אלגברה לינארית 2",
        weeksCount: 12,
        exams: { moedA: null, moedB: null, moedC: null }
      }
    ];

    for (const course of defaultCourses) {
      await db.collection('users').doc(uid).collection('cl_courses').doc(course.id).set(course);
    }

    // Create some default tasks in cl_courseTasks
    const taskSeeds = [
      { id: 'infi2-w1-lecture-0', courseId: 'infi2', scope: 'weekly', week: 1, type: 'lecture', label: 'הרצאה 1', checked: false, order: 0 },
      { id: 'infi2-w1-tutorial-0', courseId: 'infi2', scope: 'weekly', week: 1, type: 'tutorial', label: 'תרגול 1', checked: false, order: 1 },
      { id: 'infi2-w1-homework-0', courseId: 'infi2', scope: 'weekly', week: 1, type: 'homework', label: 'שיעורי בית 1', checked: false, order: 2 },
    ];
    for (const task of taskSeeds) {
      await db.collection('users').doc(uid).collection('cl_courseTasks').doc(task.id).set(task);
    }

    // Seed some mock AI Suggestions so that the AI suggestions spec can find them!
    const aiSuggestions = [
      {
        id: 'sug-1',
        userId: uid,
        type: 'daily_review',
        suggestion: 'Suggested Task: Gym',
        context: 'Gym workout recommendation',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      },
      {
        id: 'sug-2',
        userId: uid,
        type: 'daily_review',
        suggestion: 'Suggested Task: Read',
        context: 'Reading task recommendation',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      },
      {
        id: 'sug-3',
        userId: uid,
        type: 'daily_review',
        suggestion: 'Reschedule Meeting',
        context: 'Type: Reschedule\nRationale: Avoid conflict with lecture.',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      },
      {
        id: 'sug-4',
        userId: uid,
        type: 'daily_review',
        suggestion: 'Start a 30-minute daily walk',
        context: 'Healthy habits',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }
    ];

    for (const sug of aiSuggestions) {
      await db.collection('users').doc(uid).collection('cl_aiSuggestions').doc(sug.id).set(sug);
    }

    console.log('Test user setup complete.');
  } catch (error) {
    console.error('Error setting up test user:', error);
  }
}

run().catch(console.error).finally(() => process.exit(0));

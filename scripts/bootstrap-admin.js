#!/usr/bin/env node
/**
 * Admin Bootstrap Script for QuizLab
 * 
 * This script sets the admin role for a user using Firebase Admin SDK.
 * Run this ONCE after creating your first admin account.
 * 
 * Usage:
 * 1. Create a service account key in Firebase Console > Project Settings > Service Accounts
 * 2. Save as service-account.json in project root (gitignored)
 * 3. Run: node scripts/bootstrap-admin.js <user-email>
 * 
 * Note: This script requires firebase-admin package (npm install firebase-admin)
 */

const fs = require('fs');
const path = require('path');

// Check if firebase-admin is available
let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.error('❌ firebase-admin not installed. Run: npm install firebase-admin');
  process.exit(1);
}

// Load service account
const serviceAccountPath = path.join(__dirname, '..', 'service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ service-account.json not found!');
  console.error('   Create one in Firebase Console > Project Settings > Service Accounts');
  console.error('   Save as service-account.json in project root');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: serviceAccount.databaseURL || `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
  });
}

const auth = admin.auth();
const db = admin.database();

async function bootstrapAdmin(email) {
  try {
    console.log(`🔍 Looking up user: ${email}`);
    const userRecord = await auth.getUserByEmail(email);
    const uid = userRecord.uid;
    
    console.log(`✅ Found user: ${uid}`);
    
    // Set custom claim
    await auth.setCustomUserClaims(uid, { role: 'admin' });
    console.log(`✅ Set custom claim: role=admin`);
    
    // Update user profile in database
    await db.ref(`users/${uid}/role`).set('admin');
    console.log(`✅ Updated database: users/${uid}/role = admin`);
    
    // Force token refresh by revoking refresh tokens (optional)
    await auth.revokeRefreshTokens(uid);
    console.log(`✅ Revoked refresh tokens - user must re-login`);
    
    console.log('\n🎉 Admin bootstrap complete!');
    console.log(`   User: ${email} (${uid})`);
    console.log(`   Role: admin`);
    console.log('\n⚠️  User must sign out and sign back in to get new claims');
    
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ User not found: ${email}`);
      console.error('   Make sure the user has signed up first');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

// CLI
const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/bootstrap-admin.js <user-email>');
  console.error('Example: node scripts/bootstrap-admin.js teacher@example.com');
  process.exit(1);
}

bootstrapAdmin(email);
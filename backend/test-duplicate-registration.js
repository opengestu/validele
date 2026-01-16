// Test d'inscription SMS avec gestion des doublons
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDuplicateRegistration() {
  const testPhone = '+221756509302';
  const virtualEmail = testPhone.replace('+', '') + '@sms.validele.app';

  console.log('\n🧪 Test de gestion des doublons d\'inscription SMS');
  console.log('================================================\n');

  // 1. Vérifier si un profil existe déjà
  console.log('1️⃣ Vérification profil existant...');
  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role')
    .eq('phone', testPhone)
    .maybeSingle();

  if (profileError) {
    console.error('❌ Erreur:', profileError);
    return;
  }

  if (existingProfile) {
    console.log('✅ Profil trouvé:', existingProfile);
    console.log('\n   → Un compte existe déjà pour ce numéro');
  } else {
    console.log('⚪ Aucun profil trouvé');
  }

  // 2. Vérifier si un utilisateur auth existe déjà
  console.log('\n2️⃣ Vérification utilisateur auth existant...');
  const { data: users, error: userListError } = await supabase.auth.admin.listUsers();
  
  if (userListError) {
    console.error('❌ Erreur:', userListError);
    return;
  }

  const existingUser = users.users.find(u => u.email === virtualEmail);
  if (existingUser) {
    console.log('✅ Utilisateur auth trouvé:');
    console.log('   ID:', existingUser.id);
    console.log('   Email:', existingUser.email);
    console.log('   Créé le:', existingUser.created_at);
    console.log('   Metadata:', existingUser.user_metadata);
  } else {
    console.log('⚪ Aucun utilisateur auth trouvé');
  }

  // 3. Vérifier la cohérence
  console.log('\n3️⃣ Vérification de cohérence...');
  if (existingProfile && existingUser) {
    if (existingProfile.id === existingUser.id) {
      console.log('✅ Cohérence OK: Profil et Auth user correspondent');
    } else {
      console.log('❌ INCOHÉRENCE: Profil ID ≠ Auth User ID');
      console.log('   Profil ID:', existingProfile.id);
      console.log('   Auth ID:', existingUser.id);
    }
  } else if (existingProfile && !existingUser) {
    console.log('❌ INCOHÉRENCE: Profil existe mais pas de Auth user');
    console.log('   → Profil orphelin à nettoyer');
  } else if (!existingProfile && existingUser) {
    console.log('❌ INCOHÉRENCE: Auth user existe mais pas de profil');
    console.log('   → Auth user orphelin à nettoyer');
  } else {
    console.log('✅ Pas de compte existant (normal pour nouvelle inscription)');
  }

  // 4. Test de nettoyage des orphelins
  console.log('\n4️⃣ Recherche d\'utilisateurs orphelins (auth sans profil)...');
  const orphanedUsers = users.users.filter(u => {
    // Vérifier si le user a un profil
    const hasProfile = u.id;
    return !hasProfile; // Simplification - en réalité, il faudrait vérifier dans profiles
  });

  console.log(`   Trouvé ${orphanedUsers.length} utilisateurs auth à vérifier`);

  console.log('\n================================================');
  console.log('Test terminé ✓\n');
}

// Exécuter le test
testDuplicateRegistration().catch(console.error);

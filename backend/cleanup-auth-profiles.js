// Script de nettoyage des incohérences auth/profil
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupInconsistencies() {
  console.log('\n🧹 Nettoyage des incohérences auth/profil');
  console.log('==========================================\n');

  // 1. Récupérer tous les utilisateurs auth
  console.log('1️⃣ Récupération des utilisateurs auth...');
  const { data: users, error: userListError } = await supabase.auth.admin.listUsers();
  
  if (userListError) {
    console.error('❌ Erreur:', userListError);
    return;
  }

  console.log(`   ✅ ${users.users.length} utilisateurs trouvés\n`);

  // 2. Vérifier chaque utilisateur
  console.log('2️⃣ Vérification de chaque utilisateur...');
  const orphanedAuthUsers = [];
  const orphanedProfiles = [];

  for (const user of users.users) {
    // Vérifier si le profil existe
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, phone, email')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error(`   ❌ Erreur vérification profil pour ${user.email}:`, profileError);
      continue;
    }

    if (!profile) {
      console.log(`   ⚠️  Auth orphelin: ${user.email} (ID: ${user.id})`);
      orphanedAuthUsers.push(user);
    }
  }

  // 3. Récupérer tous les profils
  console.log('\n3️⃣ Vérification des profils orphelins...');
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, phone, email');

  if (profilesError) {
    console.error('❌ Erreur:', profilesError);
    return;
  }

  for (const profile of profiles) {
    // Vérifier si le user auth existe
    const userExists = users.users.find(u => u.id === profile.id);
    if (!userExists) {
      console.log(`   ⚠️  Profil orphelin: ${profile.email || profile.phone} (ID: ${profile.id})`);
      orphanedProfiles.push(profile);
    }
  }

  // 4. Résumé
  console.log('\n📊 Résumé:');
  console.log(`   Auth orphelins (user sans profil): ${orphanedAuthUsers.length}`);
  console.log(`   Profils orphelins (profil sans user): ${orphanedProfiles.length}`);

  // 5. Proposer des solutions
  if (orphanedAuthUsers.length > 0) {
    console.log('\n🔧 Solutions pour auth orphelins:');
    console.log('   Option A: Créer les profils manquants');
    console.log('   Option B: Supprimer les utilisateurs auth orphelins');
    console.log('\n   Voulez-vous créer les profils manquants ? (recommandé)');
    
    // Pour ce script, on va créer les profils automatiquement
    console.log('\n   → Création des profils manquants...');
    
    for (const user of orphanedAuthUsers) {
      const metadata = user.user_metadata || {};
      const phone = metadata.phone || null;
      const email = user.email.includes('@sms.validele.app') ? null : user.email;
      
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          full_name: metadata.full_name || 'Utilisateur',
          phone: phone,
          email: email,
          role: metadata.role || 'buyer'
        });

      if (insertError) {
        console.error(`   ❌ Erreur création profil pour ${user.email}:`, insertError);
      } else {
        console.log(`   ✅ Profil créé pour ${user.email}`);
      }
    }
  }

  if (orphanedProfiles.length > 0) {
    console.log('\n🔧 Solutions pour profils orphelins:');
    console.log('   → Suppression recommandée (profils sans auth ne peuvent pas se connecter)');
    
    for (const profile of orphanedProfiles) {
      const { error: deleteError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profile.id);

      if (deleteError) {
        console.error(`   ❌ Erreur suppression profil ${profile.id}:`, deleteError);
      } else {
        console.log(`   ✅ Profil supprimé: ${profile.email || profile.phone}`);
      }
    }
  }

  console.log('\n==========================================');
  console.log('Nettoyage terminé ✓\n');
}

// Exécuter le nettoyage
cleanupInconsistencies().catch(console.error);

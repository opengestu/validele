#!/usr/bin/env node
// Simple script to create or promote a Supabase user to admin by inserting into `admin_users`.
// Usage: node scripts/create_admin.js <email> [password]
// Requires SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL in env (.env)

const { supabase } = require('../supabase');

async function main() {
  const [, , email, password] = process.argv;
  if (!email) {
    console.error('Usage: node scripts/create_admin.js <email> [password]');
    process.exit(2);
  }

  try {
    // Find user by email
    const { data: users, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;

    let user = (users.users || []).find(u => u.email === email);

    if (!user) {
      if (!password) {
        console.error(`User ${email} not found and no password provided to create one.`);
        process.exit(3);
      }
      console.log(`User ${email} not found. Creating...`);
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (createErr) throw createErr;
      user = created.user;
      console.log('Created user id:', user.id);
    } else {
      console.log('Found user id:', user.id);
      // If a password is provided, update the existing user's password to the provided one
      if (password) {
        console.log(`Updating password for existing user ${user.id}...`);
        try {
          const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
          if (updateErr) {
            console.warn('Warning: could not update password for existing user:', updateErr.message || updateErr);
          } else {
            console.log('Password updated for user id:', user.id);
          }
        } catch (e) {
          console.warn('Warning: error while updating password for existing user:', e?.message || e);
        }
      }
    }

    // Ensure profile exists (upsert) - role must be 'vendor', 'buyer', or 'delivery' (not 'admin')
    const { error: profileErr } = await supabase.from('profiles').upsert({ id: user.id, full_name: user.user_metadata?.full_name || null, phone: user.user_metadata?.phone || null, role: 'vendor' }, { onConflict: 'id' });
    if (profileErr) {
      console.warn('Warning: could not upsert profile. Error:', profileErr.message || profileErr);
    } else {
      console.log('Profile ensured (upsert, role vendor).');
    }

    // Insert into admin_users table
    try {
      const { data: adminRow, error: insertErr } = await supabase.from('admin_users').insert({ id: user.id }).select();
      if (insertErr) {
        // If relation missing, inform user to run migration
        if (insertErr.message && insertErr.message.includes('does not exist')) {
          console.error('\nTable `admin_users` does not exist. Please create it with the SQL migration provided at `backend/migrations/001_create_admin_users.sql` or run the SQL below in your Supabase SQL editor:\n');
          console.error("CREATE TABLE IF NOT EXISTS admin_users (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now());\n");
          process.exit(4);
        }
        throw insertErr;
      }
      console.log('Inserted into admin_users:', adminRow);
    } catch (e) {
      throw e;
    }

    console.log('\nSuccess! The user is now an admin.');
    process.exit(0);
  } catch (err) {
    console.error('Error creating/promoting admin:', err.message || err);
    process.exit(1);
  }
}

main();

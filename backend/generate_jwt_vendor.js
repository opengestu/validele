// Génère un JWT pour un vendeur SMS
const jwt = require('jsonwebtoken');

const secret = 'k2yL4a8-IyEiYI3z1lfytVHdDDlgvyFphUFRiVzZtlcgCYEAg2cWSLHym8GY-kjLQGxRijKB9pAKkmtcHmt-uQ'; // Remplace par ta valeur JWT_SECRET
const payload = {
  sub: 'bf34217a-4161-40f8-9081-dce6dcbc6b59',
  phone: '+221774254729',
  auth_mode: 'sms',
  role: 'vendor',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600 // expire dans 1h
};

const token = jwt.sign(payload, secret);
console.log('JWT généré :', token);

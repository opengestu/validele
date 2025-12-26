const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configurations PayDunya
const PAYDUNYA_CONFIG = {
    masterKey: process.env.PAYDUNYA_MASTER_KEY,
    privateKey: process.env.PAYDUNYA_PRIVATE_KEY,
    token: process.env.PAYDUNYA_TOKEN
};

// Route principale
app.get('/', (req, res) => {
    res.render('index');
});

// Créer une facture
app.post('/create-invoice', async (req, res) => {
    try {
        const { invoice, store } = req.body;
        
        const response = await axios.post(
            'https://app.paydunya.com/api/v1/checkout-invoice/create',
            {
                invoice,
                store
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'PAYDUNYA-MASTER-KEY': PAYDUNYA_CONFIG.masterKey,
                    'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_CONFIG.privateKey,
                    'PAYDUNYA-TOKEN': PAYDUNYA_CONFIG.token
                }
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error('Erreur lors de la création de la facture:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création de la facture',
            error: error.response ? error.response.data : error.message
        });
    }
});

// Créer un paiement WAVE
app.post('/create-wave-payment', async (req, res) => {
    try {
        const { wave_senegal_fullName, wave_senegal_email, wave_senegal_phone, wave_senegal_payment_token } = req.body;

        const response = await axios.post(
            'https://app.paydunya.com/api/v1/softpay/wave-senegal',
            {
                wave_senegal_fullName,
                wave_senegal_email,
                wave_senegal_phone,
                wave_senegal_payment_token
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_CONFIG.privateKey
                }
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error('Erreur lors de la création du paiement WAVE:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création du paiement WAVE',
            error: error.response ? error.response.data : error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur en cours d'exécution sur le port ${PORT}`);
});

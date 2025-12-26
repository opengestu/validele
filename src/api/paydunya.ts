// Tous les appels PayDunya doivent passer par le backend. Le backend gère le mode sandbox/prod via PAYDUNYA_MODE.
// Ne pas faire d'appel direct à l'API PayDunya ici.
import axios from 'axios';
import { apiUrl } from '@/lib/api';

export const createInvoice = async (data: {
    amount: number;
    description: string;
    order_id: string;
    customer: {
        name: string;
        email: string;
        phone: string;
    };
    custom_data: { order_id: string };
}) => {
    try {
        // Adapter le body pour le backend et PayDunya
        const body = {
            invoice: {
                total_amount: data.amount, // PayDunya attend total_amount
                description: data.description,
                custom_data: data.custom_data
            },
            store: {
                name: 'Validèl',
                email: 'contact@validel.com',
                phone: '+221770000000',
                address: 'Dakar, Sénégal'
            }
        };
    const response = await axios.post(apiUrl('/api/wave/create-invoice'), body);
        return response.data;
    } catch (error) {
        console.error('Erreur lors de la création de la facture:', error);
        throw error;
    }
};

export const makeWavePayment = async (data: { 
    invoice_token: string;
    wave_senegal_fullName?: string;
    wave_senegal_email: string;
    wave_senegal_phone: string;
    password?: string; // pour le mode sandbox
}) => {
    try {
        // Correction : utilise la bonne variable d'environnement VITE_PAYDUNYA_MODE
        const paydunyaMode = import.meta.env.VITE_PAYDUNYA_MODE || 'prod';
        let payload;
        if (paydunyaMode === 'sandbox') {
            // Adapter le body pour le backend en mode sandbox
            payload = {
                phone_number: data.wave_senegal_phone,
                customer_email: data.wave_senegal_email,
                password: data.password || 'Miliey@2121',
                invoice_token: data.invoice_token
            };
        } else {
            payload = {
                invoice_token: data.invoice_token,
                wave_senegal_fullName: data.wave_senegal_fullName,
                wave_senegal_email: data.wave_senegal_email,
                wave_senegal_phone: data.wave_senegal_phone
            };
        }
    const response = await axios.post(apiUrl('/api/wave/make-payment'), payload);
        return response.data;
    } catch (error) {
        console.error('Erreur lors du paiement Wave:', error);
        throw error;
    }
};

export const makeOrangeMoneyPayment = async (data: { 
    invoice_token: string;
    orange_money_senegal_fullName?: string;
    orange_money_senegal_email: string;
    orange_money_senegal_phone: string;
    password?: string; // pour le mode sandbox
}) => {
    try {
        const paydunyaMode = import.meta.env.VITE_PAYDUNYA_MODE || 'prod';
        let payload;
        if (paydunyaMode === 'sandbox') {
            payload = {
                phone_number: data.orange_money_senegal_phone,
                customer_email: data.orange_money_senegal_email,
                password: data.password || 'Miliey@2121',
                invoice_token: data.invoice_token
            };
        } else {
            payload = {
                invoice_token: data.invoice_token,
                orange_money_senegal_fullName: data.orange_money_senegal_fullName,
                orange_money_senegal_email: data.orange_money_senegal_email,
                orange_money_senegal_phone: data.orange_money_senegal_phone
            };
        }
    const response = await axios.post(apiUrl('/api/orange-money/make-payment'), payload);
        return response.data;
    } catch (error) {
        console.error('Erreur lors du paiement Orange Money:', error);
        throw error;
    }
};

export const makeOrangeMoneyQrCodePayment = async (data: {
    invoice_token: string;
    customer_name: string;
    customer_email: string;
    phone_number: string;
    password?: string;
}) => {
    try {
        const response = await axios.post(apiUrl('/api/orange-money/qrcode'), {
            customer_name: data.customer_name,
            customer_email: data.customer_email,
            phone_number: data.phone_number,
            invoice_token: data.invoice_token,
            password: data.password
        });
        return response.data;
    } catch (error) {
        console.error('Erreur lors du paiement Orange Money QR Code:', error);
        throw error;
    }
};

export const makeOrangeMoneyOtpPayment = async (data: {
    invoice_token: string;
    customer_name: string;
    customer_email: string;
    phone_number: string;
    authorization_code: string;
    password?: string;
}) => {
    try {
        const response = await axios.post(apiUrl('/api/orange-money/otp'), {
            customer_name: data.customer_name,
            customer_email: data.customer_email,
            phone_number: data.phone_number,
            authorization_code: data.authorization_code,
            invoice_token: data.invoice_token,
            password: data.password
        });
        return response.data;
    } catch (error) {
        console.error('Erreur lors du paiement Orange Money OTP:', error);
        throw error;
    }
};

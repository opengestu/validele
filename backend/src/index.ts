import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import paymentRoutes from './routes/payment';
import orderRoutes from './routes/order';
import paydunyaRoutes from './routes/paydunya';

const app = express();
const port = process.env.PORT || 3001;

// Middleware
// Optionnel: restreindre l'origine CORS à votre domaine Netlify en prod
// const allowedOrigins = [process.env.ALLOWED_ORIGIN_NETLIFY].filter(Boolean) as string[];
// app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/paydunya', paymentRoutes);
app.use('/api/payments', paymentRoutes);
app.use(orderRoutes);
app.use(paydunyaRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

import express, { Request, Response } from 'express';
import cors from 'cors'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.route';
import { logger } from './utils/logger';


dotenv.config();

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use((req , res , next)=>{
  logger.info(`${req.method} ${req.url}`)
  next()
})

app.use('/auth', authRoutes)
app.use('/user', userRoutes)

const server = app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
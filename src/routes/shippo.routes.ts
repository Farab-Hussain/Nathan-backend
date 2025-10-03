import express from 'express';
import { 
  validateShippingAddress, 
  getShippingRatesController, 
  createShipmentController, 
  shippoWebhook 
} from '../controller/shippoController';
import { protect } from '../middlewares/auth.middleware';

const router = express.Router();

// Public webhook endpoint (no auth required)
router.post('/webhook', shippoWebhook);

// Protected routes (require authentication)
router.use(protect);

// Address validation
router.post('/validate-address', validateShippingAddress);

// Get shipping rates
router.post('/rates', getShippingRatesController);

// Create shipment
router.post('/create-shipment', createShipmentController);

export default router;

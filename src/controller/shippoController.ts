import { Request, Response } from 'express';
import { validateAddress, getShippingRates, createShipment, handleWebhookEvent } from '../services/shippoService';

// Validate shipping address
export const validateShippingAddress = async (req: Request, res: Response) => {
  try {
    const address = req.body;
    
    if (!address.name || !address.street1 || !address.city || !address.state || !address.zip || !address.country) {
      return res.status(400).json({ 
        error: 'Missing required address fields',
        required: ['name', 'street1', 'city', 'state', 'zip', 'country']
      });
    }

    const result = await validateAddress(address);
    
    res.json({
      isValid: result.isValid,
      validatedAddress: result.validatedAddress,
      suggestions: result.suggestions,
      message: result.isValid ? 'Address validated successfully' : 'Address validation completed with suggestions'
    });
  } catch (error) {
    console.error('Address validation error:', error);
    res.status(500).json({ error: 'Failed to validate address' });
  }
};

// Get shipping rates
export const getShippingRatesController = async (req: Request, res: Response) => {
  try {
    const { address, parcels } = req.body;
    
    if (!address || !parcels || !Array.isArray(parcels)) {
      return res.status(400).json({ 
        error: 'Address and parcels are required',
        required: ['address', 'parcels']
      });
    }

    const rates = await getShippingRates(address, parcels);
    
    res.json({ rates });
  } catch (error) {
    console.error('Shipping rates error:', error);
    res.status(500).json({ error: 'Failed to get shipping rates' });
  }
};

// Create shipment
export const createShipmentController = async (req: Request, res: Response) => {
  try {
    const { orderId, address, parcels, selectedRateId, rateData } = req.body;
    
    if (!orderId || !address || !parcels || !selectedRateId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['orderId', 'address', 'parcels', 'selectedRateId']
      });
    }

    const shipment = await createShipment(
      { orderId, toAddress: address, parcels }, 
      selectedRateId,
      rateData // Optional: { carrier, amount, serviceName }
    );
    
    res.json(shipment);
  } catch (error) {
    console.error('Shipment creation error:', error);
    res.status(500).json({ error: 'Failed to create shipment' });
  }
};

// Shippo webhook handler
export const shippoWebhook = async (req: Request, res: Response) => {
  try {
    console.log('📦 Shippo webhook received:', {
      headers: req.headers,
      body: req.body,
      timestamp: new Date().toISOString(),
    });

    const { event, data } = req.body;
    
    if (!event || !data) {
      return res.status(400).json({ error: 'Missing event or data' });
    }

    await handleWebhookEvent(event, data);
    
    res.json({ received: true });
  } catch (error) {
    console.error('Shippo webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

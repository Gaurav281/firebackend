import mongoose from 'mongoose';
import { config } from '../config/env.js';

const systemConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

export const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

export const getSystemConfig = async (key, fallback = null) => {
  const item = await SystemConfig.findOne({ key });
  return item ? item.value : fallback;
};

export const setSystemConfig = async (key, value, description = '') => {
  return await SystemConfig.findOneAndUpdate(
    { key },
    { value, description },
    { upsert: true, new: true }
  );
};

export const initSystemDefaults = async () => {
  const existingUpi = await SystemConfig.findOne({ key: 'admin_upi_id' });
  if (!existingUpi) {
    await setSystemConfig('admin_upi_id', config.defaultUpiId, 'Admin receiving UPI ID for deposits');
  }
  const existingName = await SystemConfig.findOne({ key: 'admin_upi_name' });
  if (!existingName) {
    await setSystemConfig('admin_upi_name', config.defaultUpiName, 'Admin display name for UPI payments');
  }
};

import mongoose from 'mongoose';

const requiredChatSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['channel', 'group', 'bot'],
      default: 'channel',
    },
    link: {
      type: String,
      required: true,
      trim: true,
    },
    chatUsernameOrId: {
      type: String,
      trim: true,
      default: '', // e.g. @FireflyAnnouncements or -1001234567890 for API getChatMember check
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const RequiredChat = mongoose.model('RequiredChat', requiredChatSchema);

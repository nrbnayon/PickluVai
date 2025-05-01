// src/app/modules/mail/mail.service.ts
import Groq from 'groq-sdk';
import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../user/user.model';
import ApiError from '../../../errors/ApiError';
import { StatusCodes } from 'http-status-codes';
import { AuthRequest } from '../../middlewares/auth';
import { Express } from 'express';
import { ReadStream, WriteStream } from 'fs';
import { Buffer } from 'buffer';
import fetch from 'node-fetch';
import * as imap from 'imap-simple';
import * as nodemailer from 'nodemailer';
import { AUTH_PROVIDER } from '../../../enums/common';
import { config } from 'dotenv';
import { IUser } from '../user/user.interface';
import { encryptionHelper } from '../../../helpers/encryptionHelper';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Interfaces for MCP server types
interface Prompt {
  name: string;
  description: string;
  arguments: PromptArgument[] | null;
}

interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[] | null;
  };
}

interface TextContent {
  type: 'text';
  text: string;
  artifact?: { type: string; data: any };
}

interface PromptMessage {
  role: 'user' | 'assistant';
  content: TextContent;
}

interface GetPromptResult {
  messages: PromptMessage[];
}

// Interface for email services
interface EmailService {
  sendEmail(
    recipientId: string,
    subject: string,
    message: string,
    attachments?: Express.Multer.File[]
  ): Promise<{ status: string; message_id?: string; error_message?: string }>;
  getUnreadEmails(): Promise<{ id: string; threadId?: string }[] | string>;
  readEmail(emailId: string): Promise<
    | {
        content: string;
        subject: string;
        from: string;
        to: string;
        date: string;
      }
    | string
  >;
  trashEmail(emailId: string): Promise<string>;
  markEmailAsRead(emailId: string): Promise<string>;
  openEmail(emailId: string): Promise<string>;
  searchEmails(
    query: string
  ): Promise<{ id: string; threadId?: string }[] | string>;
  archiveEmail(emailId: string): Promise<string>;
  replyToEmail(
    emailId: string,
    message: string,
    attachments?: Express.Multer.File[]
  ): Promise<{ status: string; message_id?: string; error_message?: string }>;
}

// MCP Server prompts and tools
const EMAIL_ADMIN_PROMPTS = `You are an email administrator powered by Grok from xAI. 
You can draft, edit, read, trash, archive, reply to, search, open, and send emails.
You've been given access to a specific email account. 
You have the following tools available:
- Send an email (send-email)
- Retrieve unread emails (get-unread-emails)
- Read email content (read-email)
- Trash email (trash-email)
- Archive email (archive-email)
- Reply to email (reply-to-email)
- Search emails (search-emails)
- Open email in browser (open-email)
Never send an email draft, trash, or archive an email unless the user confirms first. 
Always ask for approval if not already given. Use Grok's AI capabilities to assist with drafting and editing emails when requested.`;

const PROMPTS: Record<string, Prompt> = {
  'manage-email': {
    name: 'manage-email',
    description: 'Act like an email administrator with AI assistance',
    arguments: null,
  },
  'draft-email': {
    name: 'draft-email',
    description: 'Draft an email with AI assistance from Grok',
    arguments: [
      {
        name: 'content',
        description: 'What the email is about',
        required: true,
      },
      {
        name: 'recipient',
        description: 'Who should the email be addressed to',
        required: true,
      },
      {
        name: 'recipient_email',
        description: "Recipient's email address",
        required: true,
      },
    ],
  },
  'edit-draft': {
    name: 'edit-draft',
    description: 'Edit an existing email draft with AI assistance from Grok',
    arguments: [
      {
        name: 'changes',
        description: 'What changes should be made to the draft',
        required: true,
      },
      {
        name: 'current_draft',
        description: 'The current draft to edit',
        required: true,
      },
    ],
  },
};

const TOOLS: Tool[] = [
  {
    name: 'send-email',
    description:
      'Sends email to recipient. Do not use if user only asked to draft email. Drafts must be approved before sending.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient_id: {
          type: 'string',
          description: 'Recipient email address',
        },
        subject: { type: 'string', description: 'Email subject' },
        message: { type: 'string', description: 'Email content text' },
      },
      required: ['recipient_id', 'subject', 'message'],
    },
  },
  {
    name: 'trash-email',
    description: 'Moves email to trash. Confirm before moving email to trash.',
    inputSchema: {
      type: 'object',
      properties: { email_id: { type: 'string', description: 'Email ID' } },
      required: ['email_id'],
    },
  },
  {
    name: 'archive-email',
    description: 'Archives an email. Confirm before archiving.',
    inputSchema: {
      type: 'object',
      properties: { email_id: { type: 'string', description: 'Email ID' } },
      required: ['email_id'],
    },
  },
  {
    name: 'reply-to-email',
    description: 'Replies to an existing email.',
    inputSchema: {
      type: 'object',
      properties: {
        email_id: { type: 'string', description: 'Email ID to reply to' },
        message: { type: 'string', description: 'Reply content' },
      },
      required: ['email_id', 'message'],
    },
  },
  {
    name: 'get-unread-emails',
    description: 'Retrieve unread emails',
    inputSchema: { type: 'object', properties: {}, required: null },
  },
  {
    name: 'read-email',
    description: 'Retrieves given email content',
    inputSchema: {
      type: 'object',
      properties: { email_id: { type: 'string', description: 'Email ID' } },
      required: ['email_id'],
    },
  },
  {
    name: 'search-emails',
    description: 'Searches emails based on a query',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query'],
    },
  },
  {
    name: 'mark-email-as-read',
    description: 'Marks given email as read',
    inputSchema: {
      type: 'object',
      properties: { email_id: { type: 'string', description: 'Email ID' } },
      required: ['email_id'],
    },
  },
  {
    name: 'open-email',
    description: 'Open email in browser',
    inputSchema: {
      type: 'object',
      properties: { email_id: { type: 'string', description: 'Email ID' } },
      required: ['email_id'],
    },
  },
];

const oauth2Client = new google.auth.OAuth2({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});

// src/app/modules/mail/mail.service.ts
const getGoogleAuth = async (user: IUser) => {
  const accessToken = user.googleAccessToken;
  const refreshToken = user.refreshToken;
  console.log('Google Auth - Token Info:', {
    userId: user._id,
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
    refreshToken,
  });

  oauth2Client.setCredentials({
    access_token: accessToken || undefined,
    refresh_token: refreshToken || undefined,
  });

  if (!refreshToken) {
    console.warn('No refresh token available for user:', user.email);
    try {
      await oauth2Client.getTokenInfo(accessToken!);
      console.log('Access token is still valid, proceeding without refresh.');
      return oauth2Client;
    } catch (error) {
      console.error(
        'Access token expired and no refresh token available:',
        error
      );
      throw new ApiError(
        StatusCodes.UNAUTHORIZED,
        'Authentication expired. Please re-authenticate with Google.'
      );
    }
  }

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log('Token refreshed successfully:', {
      newAccessToken: credentials.access_token ? 'present' : 'not present',
      newRefreshToken: credentials.refresh_token ? 'present' : 'not present',
    });
    if (credentials.access_token) {
      user.googleAccessToken = encryptionHelper.encrypt(
        credentials.access_token
      );
      if (credentials.refresh_token) {
        user.refreshToken = encryptionHelper.encrypt(credentials.refresh_token);
      }
      user.lastSync = new Date();
      await user.save();
    }
    return oauth2Client;
  } catch (error) {
    console.error('Token refresh failed:', error.response?.data || error);
    throw new ApiError(
      StatusCodes.UNAUTHORIZED,
      'Failed to refresh Google token'
    );
  }
};

// Mock Grok AI integration (replace with actual xAI API when available)
// const mockGrokResponse = async (input: string): Promise<string> => {
//   // Simulate Grok's response (this would be an API call in a real scenario)
//   return new Promise(resolve => {
//     setTimeout(() => {
//       if (input.includes('draft')) {
//         resolve(
//           `Subject: Draft Email\n\nDear [Recipient],\n\n${input}\n\nBest regards,\n[Your Name]`
//         );
//       } else if (input.includes('edit')) {
//         resolve(`Edited draft: ${input}\n\n[Changes applied by Grok]`);
//       } else {
//         resolve("Grok: I'm here to assist with your email tasks!");
//       }
//     }, 500);
//   });
// };

// Replace mockGrokResponse with real Groq API call
const groqResponse = async (
  input: string,
  model: string = 'llama-3.3-70b-versatile'
): Promise<string> => {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'You are an AI assistant built by xAI, designed to help with email tasks efficiently.',
        },
        {
          role: 'user',
          content: input,
        },
      ],
      model,
      max_tokens: 32768, // Matches llama-3.3-70b-versatile's max completion tokens
      temperature: 0.7, // Adjust for creativity vs. determinism
    });
    return (
      chatCompletion.choices[0]?.message?.content || 'No response generated.'
    );
  } catch (error) {
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      `Groq API error: ${(error as Error).message}`
    );
  }
};

// Gmail-specific email service
class GmailService implements EmailService {
  private gmail: gmail_v1.Gmail;
  private userEmail: string;

  constructor(oauth2Client: OAuth2Client, userEmail: string) {
    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    this.userEmail = userEmail;
  }

  async sendEmail(
    recipientId: string,
    subject: string,
    message: string,
    attachments?: Express.Multer.File[]
  ): Promise<{ status: string; message_id?: string; error_message?: string }> {
    try {
      const messageParts = [
        `From: ${this.userEmail}`,
        `To: ${recipientId}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
      ];

      if (attachments && attachments.length > 0) {
        const boundary = `boundary_${Date.now().toString(16)}`;
        messageParts.push(
          `Content-Type: multipart/mixed; boundary=${boundary}`
        );
        messageParts.push('');
        messageParts.push(`--${boundary}`);
        messageParts.push('Content-Type: text/plain; charset=UTF-8');
        messageParts.push('Content-Transfer-Encoding: 7bit');
        messageParts.push('');
        messageParts.push(message);
        messageParts.push('');

        for (const file of attachments) {
          messageParts.push(`--${boundary}`);
          messageParts.push(
            `Content-Type: ${file.mimetype || 'application/octet-stream'}`
          );
          messageParts.push('Content-Transfer-Encoding: base64');
          messageParts.push(
            `Content-Disposition: attachment; filename="${file.originalname}"`
          );
          messageParts.push('');
          const fileContent = Buffer.from(file.buffer).toString('base64');
          for (let i = 0; i < fileContent.length; i += 76) {
            messageParts.push(fileContent.substring(i, i + 76));
          }
          messageParts.push('');
        }
        messageParts.push(`--${boundary}--`);
      } else {
        messageParts.push('Content-Type: text/plain; charset=UTF-8');
        messageParts.push('');
        messageParts.push(message);
      }

      const email = messageParts.join('\r\n');
      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedEmail },
      });

      return { status: 'success', message_id: response.data.id };
    } catch (error) {
      return { status: 'error', error_message: (error as Error).message };
    }
  }

  async getUnreadEmails(): Promise<
    { id: string; threadId?: string }[] | string
  > {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'in:inbox is:unread category:primary',
      });
      return response.data.messages || [];
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async readEmail(emailId: string): Promise<
    | {
        content: string;
        subject: string;
        from: string;
        to: string;
        date: string;
      }
    | string
  > {
    try {
      const msg = await this.gmail.users.messages.get({
        userId: 'me',
        id: emailId,
        format: 'full',
      });

      let body = '';
      if (msg.data.payload?.parts) {
        for (const part of msg.data.payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body = Buffer.from(part.body.data, 'base64').toString();
            break;
          }
        }
      } else if (msg.data.payload?.body?.data) {
        body = Buffer.from(msg.data.payload.body.data, 'base64').toString();
      }

      const headers = msg.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const to = headers.find(h => h.name === 'To')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      await this.markEmailAsRead(emailId);
      return { content: body, subject, from, to, date };
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async trashEmail(emailId: string): Promise<string> {
    try {
      await this.gmail.users.messages.trash({ userId: 'me', id: emailId });
      return 'Email moved to trash successfully.';
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async archiveEmail(emailId: string): Promise<string> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: { removeLabelIds: ['INBOX'] },
      });
      return 'Email archived successfully.';
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async replyToEmail(
    emailId: string,
    message: string,
    attachments?: Express.Multer.File[]
  ): Promise<{ status: string; message_id?: string; error_message?: string }> {
    try {
      const original = await this.gmail.users.messages.get({
        userId: 'me',
        id: emailId,
        format: 'full',
      });
      const headers = original.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const messageId = headers.find(h => h.name === 'Message-ID')?.value || '';

      const messageParts = [
        `From: ${this.userEmail}`,
        `To: ${from}`,
        `Subject: Re: ${subject.replace(/^Re: /i, '')}`,
        `In-Reply-To: ${messageId}`,
        `References: ${messageId}`,
        'MIME-Version: 1.0',
      ];

      if (attachments && attachments.length > 0) {
        const boundary = `boundary_${Date.now().toString(16)}`;
        messageParts.push(
          `Content-Type: multipart/mixed; boundary=${boundary}`
        );
        messageParts.push('');
        messageParts.push(`--${boundary}`);
        messageParts.push('Content-Type: text/plain; charset=UTF-8');
        messageParts.push('Content-Transfer-Encoding: 7bit');
        messageParts.push('');
        messageParts.push(message);
        messageParts.push('');

        for (const file of attachments) {
          messageParts.push(`--${boundary}`);
          messageParts.push(
            `Content-Type: ${file.mimetype || 'application/octet-stream'}`
          );
          messageParts.push('Content-Transfer-Encoding: base64');
          messageParts.push(
            `Content-Disposition: attachment; filename="${file.originalname}"`
          );
          messageParts.push('');
          const fileContent = Buffer.from(file.buffer).toString('base64');
          for (let i = 0; i < fileContent.length; i += 76) {
            messageParts.push(fileContent.substring(i, i + 76));
          }
          messageParts.push('');
        }
        messageParts.push(`--${boundary}--`);
      } else {
        messageParts.push('Content-Type: text/plain; charset=UTF-8');
        messageParts.push('');
        messageParts.push(message);
      }

      const email = messageParts.join('\r\n');
      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedEmail, threadId: original.data.threadId },
      });

      return { status: 'success', message_id: response.data.id };
    } catch (error) {
      return { status: 'error', error_message: (error as Error).message };
    }
  }

  async searchEmails(
    query: string
  ): Promise<{ id: string; threadId?: string }[] | string> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
      });
      return response.data.messages || [];
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async markEmailAsRead(emailId: string): Promise<string> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: { removeLabelIds: ['UNREAD'] },
      });
      return 'Email marked as read.';
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async openEmail(emailId: string): Promise<string> {
    try {
      const url = `https://mail.google.com/mail/u/0/#inbox/${emailId}`;
      return `Email can be opened at: ${url}`;
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }
}

// Outlook-specific email service
class OutlookService implements EmailService {
  private accessToken: string;
  private userEmail: string;

  constructor(accessToken: string, userEmail: string) {
    this.accessToken = accessToken;
    this.userEmail = userEmail;
  }

  async sendEmail(
    recipientId: string,
    subject: string,
    message: string,
    attachments?: Express.Multer.File[]
  ): Promise<{ status: string; message_id?: string; error_message?: string }> {
    try {
      const response = await fetch(
        'https://graph.microsoft.com/v1.0/me/sendMail',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: 'Text', content: message },
              toRecipients: [{ emailAddress: { address: recipientId } }],
              attachments: attachments?.map(file => ({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: file.originalname,
                contentType: file.mimetype,
                contentBytes: Buffer.from(file.buffer).toString('base64'),
              })),
            },
          }),
        }
      );

      if (!response.ok) throw new Error(await response.text());
      return { status: 'success' };
    } catch (error) {
      return { status: 'error', error_message: (error as Error).message };
    }
  }

  async getUnreadEmails(): Promise<
    { id: string; threadId?: string }[] | string
  > {
    try {
      const response = await fetch(
        'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=isRead eq false',
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      const data = await response.json();
      return data.value.map((msg: any) => ({
        id: msg.id,
        threadId: msg.conversationId,
      }));
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async readEmail(emailId: string): Promise<
    | {
        content: string;
        subject: string;
        from: string;
        to: string;
        date: string;
      }
    | string
  > {
    try {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${emailId}`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` },
        }
      );
      const data = await response.json();
      await this.markEmailAsRead(emailId);
      return {
        content: data.body.content,
        subject: data.subject,
        from: data.from.emailAddress.address,
        to: data.toRecipients[0].emailAddress.address,
        date: data.receivedDateTime,
      };
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async trashEmail(emailId: string): Promise<string> {
    try {
      await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${emailId}/move`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ destinationId: 'deleteditems' }),
        }
      );
      return 'Email moved to trash successfully.';
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async archiveEmail(emailId: string): Promise<string> {
    try {
      await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${emailId}/move`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ destinationId: 'archive' }),
        }
      );
      return 'Email archived successfully.';
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async replyToEmail(
    emailId: string,
    message: string,
    attachments?: Express.Multer.File[]
  ): Promise<{ status: string; message_id?: string; error_message?: string }> {
    try {
      const original = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${emailId}`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` },
        }
      );
      const originalData = await original.json();

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${emailId}/createReply`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const replyDraft = await response.json();

      const sendResponse = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${replyDraft.id}/send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              body: { contentType: 'Text', content: message },
              attachments: attachments?.map(file => ({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: file.originalname,
                contentType: file.mimetype,
                contentBytes: Buffer.from(file.buffer).toString('base64'),
              })),
            },
          }),
        }
      );

      if (!sendResponse.ok) throw new Error(await sendResponse.text());
      return { status: 'success', message_id: replyDraft.id };
    } catch (error) {
      return { status: 'error', error_message: (error as Error).message };
    }
  }

  async searchEmails(
    query: string
  ): Promise<{ id: string; threadId?: string }[] | string> {
    try {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages?$search="${query}"`,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      const data = await response.json();
      return data.value.map((msg: any) => ({
        id: msg.id,
        threadId: msg.conversationId,
      }));
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async markEmailAsRead(emailId: string): Promise<string> {
    try {
      await fetch(`https://graph.microsoft.com/v1.0/me/messages/${emailId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isRead: true }),
      });
      return 'Email marked as read.';
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async openEmail(emailId: string): Promise<string> {
    try {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${emailId}`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` },
        }
      );
      const data = await response.json();
      return `Email can be opened at: ${data.webLink}`;
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }
}

// Yahoo-specific email service using IMAP and SMTP
class YahooService implements EmailService {
  private accessToken: string;
  private refreshToken: string;
  private userEmail: string;
  private transporter: nodemailer.Transporter;

  constructor(accessToken: string, refreshToken: string, userEmail: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.userEmail = userEmail;
    this.transporter = nodemailer.createTransport({
      host: 'smtp.mail.yahoo.com',
      port: 465,
      secure: true,
      auth: {
        type: 'OAuth2',
        user: this.userEmail,
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        clientId: process.env.YAHOO_CLIENT_ID, // Set in .env
        clientSecret: process.env.YAHOO_CLIENT_SECRET, // Set in .env
      },
    });
  }

  async sendEmail(
    recipientId: string,
    subject: string,
    message: string,
    attachments?: Express.Multer.File[]
  ): Promise<{ status: string; message_id?: string; error_message?: string }> {
    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: this.userEmail,
        to: recipientId,
        subject,
        text: message,
        attachments: attachments?.map(file => ({
          filename: file.originalname,
          content: file.buffer,
          contentType: file.mimetype,
        })),
      };

      const info = await this.transporter.sendMail(mailOptions);
      return { status: 'success', message_id: info.messageId };
    } catch (error) {
      return { status: 'error', error_message: (error as Error).message };
    }
  }

  async getUnreadEmails(): Promise<
    { id: string; threadId?: string }[] | string
  > {
    try {
      const config = {
        imap: {
          user: this.userEmail,
          password: this.accessToken,
          host: 'imap.mail.yahoo.com',
          port: 993,
          tls: true,
          authTimeout: 3000,
          tlsOptions: { rejectUnauthorized: false },
        },
      };

      const connection = await imap.connect(config);
      await connection.openBox('INBOX');
      const searchCriteria = ['UNSEEN'];
      const fetchOptions = { bodies: ['HEADER'], struct: true };
      const messages = await connection.search(searchCriteria, fetchOptions);
      await connection.end();

      return messages.map(msg => ({
        id: msg.attributes.uid.toString(),
        threadId: msg.attributes['message-id'],
      }));
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async readEmail(emailId: string): Promise<
    | {
        content: string;
        subject: string;
        from: string;
        to: string;
        date: string;
      }
    | string
  > {
    try {
      const config = {
        imap: {
          user: this.userEmail,
          password: this.accessToken,
          host: 'imap.mail.yahoo.com',
          port: 993,
          tls: true,
          authTimeout: 3000,
          tlsOptions: { rejectUnauthorized: false },
        },
      };

      const connection = await imap.connect(config);
      await connection.openBox('INBOX');
      const searchCriteria = [['UID', emailId]];
      const fetchOptions = { bodies: [''], struct: true };
      const messages = await connection.search(searchCriteria, fetchOptions);

      if (!messages.length) throw new Error('Email not found');

      const msg = messages[0];
      const body =
        msg.parts.find(part => part.which === '')?.body.toString() || '';
      const headers = msg.parts.find(part => part.which === 'HEADER')?.body;
      const subject = headers?.subject?.[0] || '';
      const from = headers?.from?.[0] || '';
      const to = headers?.to?.[0] || '';
      const date = headers?.date?.[0] || '';

      await this.markEmailAsRead(emailId);
      await connection.end();

      return { content: body, subject, from, to, date };
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async trashEmail(emailId: string): Promise<string> {
    try {
      const config = {
        imap: {
          user: this.userEmail,
          password: this.accessToken,
          host: 'imap.mail.yahoo.com',
          port: 993,
          tls: true,
          authTimeout: 3000,
          tlsOptions: { rejectUnauthorized: false },
        },
      };

      const connection = await imap.connect(config);
      await connection.openBox('INBOX');
      await connection.moveMessage(emailId, 'Trash');
      await connection.end();
      return 'Email moved to trash successfully.';
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async archiveEmail(emailId: string): Promise<string> {
    try {
      const config = {
        imap: {
          user: this.userEmail,
          password: this.accessToken,
          host: 'imap.mail.yahoo.com',
          port: 993,
          tls: true,
          authTimeout: 3000,
          tlsOptions: { rejectUnauthorized: false },
        },
      };

      const connection = await imap.connect(config);
      await connection.openBox('INBOX');
      await connection.moveMessage(emailId, 'Archive');
      await connection.end();
      return 'Email archived successfully.';
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async replyToEmail(
    emailId: string,
    message: string,
    attachments?: Express.Multer.File[]
  ): Promise<{ status: string; message_id?: string; error_message?: string }> {
    try {
      const config = {
        imap: {
          user: this.userEmail,
          password: this.accessToken,
          host: 'imap.mail.yahoo.com',
          port: 993,
          tls: true,
          authTimeout: 3000,
          tlsOptions: { rejectUnauthorized: false },
        },
      };

      const connection = await imap.connect(config);
      await connection.openBox('INBOX');
      const searchCriteria = [['UID', emailId]];
      const fetchOptions = { bodies: ['HEADER'], struct: true };
      const messages = await connection.search(searchCriteria, fetchOptions);
      await connection.end();

      if (!messages.length) throw new Error('Email not found');

      const original = messages[0];
      const headers = original.parts.find(
        part => part.which === 'HEADER'
      )?.body;
      const subject = headers?.subject?.[0] || '';
      const from = headers?.from?.[0] || '';

      const mailOptions: nodemailer.SendMailOptions = {
        from: this.userEmail,
        to: from,
        subject: `Re: ${subject.replace(/^Re: /i, '')}`,
        text: message,
        inReplyTo: headers?.['message-id']?.[0],
        references: headers?.['message-id']?.[0],
        attachments: attachments?.map(file => ({
          filename: file.originalname,
          content: file.buffer,
          contentType: file.mimetype,
        })),
      };

      const info = await this.transporter.sendMail(mailOptions);
      return { status: 'success', message_id: info.messageId };
    } catch (error) {
      return { status: 'error', error_message: (error as Error).message };
    }
  }

  async searchEmails(
    query: string
  ): Promise<{ id: string; threadId?: string }[] | string> {
    try {
      const config = {
        imap: {
          user: this.userEmail,
          password: this.accessToken,
          host: 'imap.mail.yahoo.com',
          port: 993,
          tls: true,
          authTimeout: 3000,
          tlsOptions: { rejectUnauthorized: false },
        },
      };

      const connection = await imap.connect(config);
      await connection.openBox('INBOX');
      const searchCriteria = [query];
      const fetchOptions = { bodies: ['HEADER'], struct: true };
      const messages = await connection.search(searchCriteria, fetchOptions);
      await connection.end();

      return messages.map(msg => ({
        id: msg.attributes.uid.toString(),
        threadId: msg.attributes['message-id'],
      }));
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async markEmailAsRead(emailId: string): Promise<string> {
    try {
      const config = {
        imap: {
          user: this.userEmail,
          password: this.accessToken,
          host: 'imap.mail.yahoo.com',
          port: 993,
          tls: true,
          authTimeout: 3000,
          tlsOptions: { rejectUnauthorized: false },
        },
      };

      const connection = await imap.connect(config);
      await connection.openBox('INBOX');
      await connection.addFlags(emailId, '\\Seen');
      await connection.end();
      return 'Email marked as read.';
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }

  async openEmail(emailId: string): Promise<string> {
    try {
      const url = `https://mail.yahoo.com/d/folders/1/messages/${emailId}`;
      return `Email can be opened at: ${url}`;
    } catch (error) {
      return `An error occurred: ${(error as Error).message}`;
    }
  }
}

// Factory to create the appropriate email service
const createEmailService = async (req: AuthRequest): Promise<EmailService> => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');

  const authProvider = user.authProvider;
  const userEmail = user.email;

  switch (authProvider) {
    case AUTH_PROVIDER.GOOGLE: {
      const auth = await getGoogleAuth(user);
      return new GmailService(auth, userEmail);
    }
    case AUTH_PROVIDER.MICROSOFT: {
      const decryptedAccessToken = encryptionHelper.decrypt(
        user.microsoftAccessToken || ''
      );
      return new OutlookService(decryptedAccessToken, userEmail);
    }
    case AUTH_PROVIDER.YAHOO: {
      const decryptedAccessToken = encryptionHelper.decrypt(
        user.yahooAccessToken || ''
      );
      const decryptedRefreshToken = user.refreshToken
        ? encryptionHelper.decrypt(user.refreshToken)
        : '';
      return new YahooService(
        decryptedAccessToken,
        decryptedRefreshToken,
        userEmail
      );
    }
    default:
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Unsupported auth provider: ${authProvider}`
      );
  }
};

// MCP Server implementation
class MCPServer {
  private emailService: EmailService;

  constructor(emailService: EmailService) {
    this.emailService = emailService;
  }

  async listPrompts(): Promise<Prompt[]> {
    return Object.values(PROMPTS);
  }

  // async getPrompt(
  //   name: string,
  //   args?: Record<string, string>
  // ): Promise<GetPromptResult> {
  //   if (!PROMPTS[name]) throw new Error(`Prompt not found: ${name}`);

  //   if (name === 'manage-email') {
  //     return {
  //       messages: [
  //         {
  //           role: 'user',
  //           content: { type: 'text', text: EMAIL_ADMIN_PROMPTS },
  //         },
  //         {
  //           role: 'assistant',
  //           content: {
  //             type: 'text',
  //             text: await mockGrokResponse('Welcome to email management!'),
  //           },
  //         },
  //       ],
  //     };
  //   } else if (name === 'draft-email') {
  //     const content = args?.content || '';
  //     const recipient = args?.recipient || '';
  //     const recipientEmail = args?.recipient_email || '';
  //     const aiDraft = await mockGrokResponse(
  //       `Draft an email about ${content} for ${recipient} (${recipientEmail})`
  //     );
  //     return {
  //       messages: [
  //         {
  //           role: 'user',
  //           content: {
  //             type: 'text',
  //             text: `Please draft an email about ${content} for ${recipient} (${recipientEmail}). Include a subject line starting with 'Subject:' on the first line. Do not send the email yet, just draft it and ask the user for their thoughts.`,
  //           },
  //         },
  //         {
  //           role: 'assistant',
  //           content: {
  //             type: 'text',
  //             text: `${aiDraft}\n\nWhat do you think of this draft?`,
  //           },
  //         },
  //       ],
  //     };
  //   } else if (name === 'edit-draft') {
  //     const changes = args?.changes || '';
  //     const currentDraft = args?.current_draft || '';
  //     const aiEdit = await mockGrokResponse(
  //       `Edit this draft: ${currentDraft} with changes: ${changes}`
  //     );
  //     return {
  //       messages: [
  //         {
  //           role: 'user',
  //           content: {
  //             type: 'text',
  //             text: `Please revise the current email draft:\n${currentDraft}\n\nRequested changes:\n${changes}\n\nPlease provide the updated draft.`,
  //           },
  //         },
  //         {
  //           role: 'assistant',
  //           content: { type: 'text', text: aiEdit },
  //         },
  //       ],
  //     };
  //   }
  //   throw new Error('Prompt implementation not found');
  // }

  async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<GetPromptResult> {
    if (!PROMPTS[name]) throw new Error(`Prompt not found: ${name}`);

    if (name === 'manage-email') {
      return {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: EMAIL_ADMIN_PROMPTS },
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: await groqResponse(
                'Welcome to email management with Groq!'
              ),
            },
          },
        ],
      };
    } else if (name === 'draft-email') {
      const content = args?.content || '';
      const recipient = args?.recipient || '';
      const recipientEmail = args?.recipient_email || '';
      const aiDraft = await groqResponse(
        `Draft an email about ${content} for ${recipient} (${recipientEmail}). Include a subject line starting with 'Subject:' on the first line. Do not send the email yet, just draft it and ask the user for their thoughts.`
      );
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please draft an email about ${content} for ${recipient} (${recipientEmail}).`,
            },
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `${aiDraft}\n\nWhat do you think of this draft?`,
            },
          },
        ],
      };
    } else if (name === 'edit-draft') {
      const changes = args?.changes || '';
      const currentDraft = args?.current_draft || '';
      const aiEdit = await groqResponse(
        `Edit this draft: ${currentDraft} with changes: ${changes}`
      );
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please revise the current email draft:\n${currentDraft}\n\nRequested changes:\n${changes}`,
            },
          },
          {
            role: 'assistant',
            content: { type: 'text', text: aiEdit },
          },
        ],
      };
    }
    throw new Error('Prompt implementation not found');
  }

  async listTools(): Promise<Tool[]> {
    return TOOLS;
  }

  async callTool(
    name: string,
    args?: Record<string, any>
  ): Promise<TextContent[]> {
    switch (name) {
      case 'send-email': {
        const recipientId = args?.recipient_id;
        const subject = args?.subject;
        const message = args?.message;
        if (!recipientId || !subject || !message)
          throw new Error('Missing required parameters');
        const sendResponse = await this.emailService.sendEmail(
          recipientId,
          subject,
          message
        );
        return [
          {
            type: 'text',
            text:
              sendResponse.status === 'success'
                ? `Email sent successfully. Message ID: ${sendResponse.message_id}`
                : `Failed to send email: ${sendResponse.error_message}`,
          },
        ];
      }
      case 'get-unread-emails': {
        const unreadEmails = await this.emailService.getUnreadEmails();
        return [
          {
            type: 'text',
            text: JSON.stringify(unreadEmails),
            artifact: { type: 'json', data: unreadEmails },
          },
        ];
      }
      case 'read-email': {
        const emailId = args?.email_id;
        if (!emailId) throw new Error('Missing email ID parameter');
        const retrievedEmail = await this.emailService.readEmail(emailId);
        return [
          {
            type: 'text',
            text: JSON.stringify(retrievedEmail),
            artifact: { type: 'dictionary', data: retrievedEmail },
          },
        ];
      }
      case 'open-email': {
        const emailId = args?.email_id;
        if (!emailId) throw new Error('Missing email ID parameter');
        const msg = await this.emailService.openEmail(emailId);
        return [{ type: 'text', text: msg }];
      }
      case 'trash-email': {
        const emailId = args?.email_id;
        if (!emailId) throw new Error('Missing email ID parameter');
        const msg = await this.emailService.trashEmail(emailId);
        return [{ type: 'text', text: msg }];
      }
      case 'archive-email': {
        const emailId = args?.email_id;
        if (!emailId) throw new Error('Missing email ID parameter');
        const msg = await this.emailService.archiveEmail(emailId);
        return [{ type: 'text', text: msg }];
      }
      case 'reply-to-email': {
        const emailId = args?.email_id;
        const message = args?.message;
        if (!emailId || !message)
          throw new Error('Missing required parameters');
        const replyResponse = await this.emailService.replyToEmail(
          emailId,
          message
        );
        return [
          {
            type: 'text',
            text:
              replyResponse.status === 'success'
                ? `Reply sent successfully. Message ID: ${replyResponse.message_id}`
                : `Failed to send reply: ${replyResponse.error_message}`,
          },
        ];
      }
      case 'search-emails': {
        const query = args?.query;
        if (!query) throw new Error('Missing query parameter');
        const searchResults = await this.emailService.searchEmails(query);
        return [
          {
            type: 'text',
            text: JSON.stringify(searchResults),
            artifact: { type: 'json', data: searchResults },
          },
        ];
      }
      case 'mark-email-as-read': {
        const emailId = args?.email_id;
        if (!emailId) throw new Error('Missing email ID parameter');
        const msg = await this.emailService.markEmailAsRead(emailId);
        return [{ type: 'text', text: msg }];
      }
      case 'summarize-email': {
        const emailId = args?.email_id;
        if (!emailId) throw new Error('Missing email ID parameter');
        const emailContent = await this.emailService.readEmail(emailId);
        if (typeof emailContent === 'string') throw new Error(emailContent);
        const summary = await groqResponse(
          `Summarize this email content: ${emailContent.content}`
        );
        return [
          {
            type: 'text',
            text: summary,
          },
        ];
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  async run(readStream: ReadStream, writeStream: WriteStream): Promise<void> {
    throw new Error('Stdio server not implemented in Express.js context');
  }
}

// Service methods for email operations
export const fetchEmails = async (req: AuthRequest) => {
  const emailService = await createEmailService(req);
  console.log('get response email:::', emailService);

  const mcpServer = new MCPServer(emailService);
  console.log('get response email:::', mcpServer);

  const unreadEmails = await mcpServer.callTool('get-unread-emails');
  console.log('get response email:::', unreadEmails);

  return unreadEmails[0].artifact?.data;
};

export const sendEmail = async (
  req: AuthRequest,
  to: string,
  subject: string,
  message: string,
  attachments?: Express.Multer.File[]
) => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  const sendResponse = await mcpServer.callTool('send-email', {
    recipient_id: to,
    subject,
    message,
  });
  return sendResponse[0].text;
};

export const readEmail = async (req: AuthRequest, emailId: string) => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  const emailContent = await mcpServer.callTool('read-email', {
    email_id: emailId,
  });
  return emailContent[0].artifact?.data;
};

export const trashEmail = async (req: AuthRequest, emailId: string) => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  const trashResponse = await mcpServer.callTool('trash-email', {
    email_id: emailId,
  });
  return trashResponse[0].text;
};

export const archiveEmail = async (req: AuthRequest, emailId: string) => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  const archiveResponse = await mcpServer.callTool('archive-email', {
    email_id: emailId,
  });
  return archiveResponse[0].text;
};

export const replyToEmail = async (
  req: AuthRequest,
  emailId: string,
  message: string,
  attachments?: Express.Multer.File[]
) => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  const replyResponse = await mcpServer.callTool('reply-to-email', {
    email_id: emailId,
    message,
  });
  return replyResponse[0].text;
};

export const searchEmails = async (req: AuthRequest, query: string) => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  const searchResponse = await mcpServer.callTool('search-emails', { query });
  return searchResponse[0].artifact?.data;
};

export const markEmailAsRead = async (req: AuthRequest, emailId: string) => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  const readResponse = await mcpServer.callTool('mark-email-as-read', {
    email_id: emailId,
  });
  return readResponse[0].text;
};

export const summarizeEmail = async (req: AuthRequest, emailId: string) => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  const summaryResponse = await mcpServer.callTool('summarize-email', {
    email_id: emailId,
  });
  return summaryResponse[0].text;
};

export const openEmail = async (req: AuthRequest, emailId: string) => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  const openResponse = await mcpServer.callTool('open-email', {
    email_id: emailId,
  });
  return openResponse[0].text;
};

export const getPrompt = async (
  req: AuthRequest,
  name: string,
  args?: Record<string, string>
) => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  return mcpServer.getPrompt(name, args);
};

export const listPrompts = async (req: AuthRequest) => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  return mcpServer.listPrompts();
};

export const listTools = async (req: AuthRequest) => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  return mcpServer.listTools();
};

export const chatWithBot = async (
  req: AuthRequest,
  message: string
): Promise<TextContent[]> => {
  const emailService = await createEmailService(req);
  const mcpServer = new MCPServer(emailService);
  const user = await User.findById(req.user?.userId);
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');

  const lowerMessage = message.toLowerCase();

  // Action: Draft an email
  if (lowerMessage.includes('draft an email')) {
    const match = message.match(/to\s+([^ ]+)\s+about\s+(.+)/i);
    if (match) {
      const [, recipient, content] = match;
      const recipientEmail = `${recipient}@example.com`;
      const draft = await mcpServer.getPrompt('draft-email', {
        recipient,
        content,
        recipient_email: recipientEmail,
      });
      req.session.lastDraft = {
        recipient_id: recipientEmail,
        subject: draft.messages[1].content.text
          .split('\n')[0]
          .replace('Subject: ', ''),
        message: draft.messages[1].content.text.split('\n\n')[1],
      };
      return draft.messages.map(msg => msg.content);
    }
  }

  // Action: Send an email (after draft approval)
  if (
    lowerMessage.includes('send the email') ||
    lowerMessage.includes('yes, send it')
  ) {
    const lastDraft = (req.session as any)?.lastDraft; // Type assertion to handle dynamic session property
    if (lastDraft) {
      const sendResponse = await mcpServer.callTool('send-email', lastDraft);
      delete (req.session as any).lastDraft; // Clear draft after sending with type assertion
      return sendResponse;
    }
    return [
      {
        type: 'text',
        text: 'No draft found to send. Please draft an email first.',
      },
    ];
  }

  // Action: Summarize latest email
  if (lowerMessage.includes('summarize') && lowerMessage.includes('email')) {
    const unreadEmails = await mcpServer.callTool('get-unread-emails');
    const emails = unreadEmails[0].artifact?.data;
    if (Array.isArray(emails) && emails.length > 0) {
      const latestEmailId = emails[0].id;
      const summary = await mcpServer.callTool('summarize-email', {
        email_id: latestEmailId,
      });
      return summary;
    }
    return [{ type: 'text', text: 'No unread emails found to summarize.' }];
  }

  // Action: Read latest email
  if (lowerMessage.includes('read') && lowerMessage.includes('email')) {
    const unreadEmails = await mcpServer.callTool('get-unread-emails');
    const emails = unreadEmails[0].artifact?.data;
    if (Array.isArray(emails) && emails.length > 0) {
      const latestEmailId = emails[0].id;
      const emailContent = await mcpServer.callTool('read-email', {
        email_id: latestEmailId,
      });
      return emailContent;
    }
    return [{ type: 'text', text: 'No unread emails found to read.' }];
  }

  // Action: Trash an email
  if (lowerMessage.includes('trash') && lowerMessage.includes('email')) {
    const match = message.match(/email\s+(\d+)/i);
    const emailId = match ? match[1] : null;
    if (emailId) {
      const trashResponse = await mcpServer.callTool('trash-email', {
        email_id: emailId,
      });
      return trashResponse;
    }
    return [
      {
        type: 'text',
        text: 'Please specify an email ID to trash (e.g., "trash email 123").',
      },
    ];
  }

  // Default: Conversational response
  const response = await groqResponse(
    `User asked: "${message}". Respond helpfully and naturally, using your capabilities as an email assistant powered by Grok from xAI.`
  );
  return [{ type: 'text', text: response }];
};

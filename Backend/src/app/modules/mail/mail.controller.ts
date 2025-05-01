// src/app/modules/mail/mail.controller.ts
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { AuthRequest } from '../../middlewares/auth';
import ApiError from '../../../errors/ApiError';
import {
  fetchEmails,
  sendEmail,
  readEmail,
  trashEmail,
  archiveEmail,
  replyToEmail,
  searchEmails,
  markEmailAsRead,
  openEmail,
  getPrompt,
  listPrompts,
  listTools,
  summarizeEmail,
  chatWithBot,
} from './mail.service';

const fetchEmailsController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const emails = await fetchEmails(authReq);
    console.log('Get all  email::', emails);
    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: `Emails fetched successfully for provider ${authReq.user.authProvider}`,
      data: emails,
    });
  }
);

const sendEmailController = catchAsync(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { to, subject, message } = req.body;
  const files = req.files as Express.Multer.File[];
  const result = await sendEmail(authReq, to, subject, message, files);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Email sent successfully',
    data: result,
  });
});

const readEmailController = catchAsync(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { id } = req.params;
  const emailContent = await readEmail(authReq, id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Email read successfully',
    data: emailContent,
  });
});

const trashEmailController = catchAsync(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { id } = req.params;
  const result = await trashEmail(authReq, id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Email trashed successfully',
    data: result,
  });
});

const archiveEmailController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const result = await archiveEmail(authReq, id);
    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Email archived successfully',
      data: result,
    });
  }
);

const replyToEmailController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { message } = req.body;
    const files = req.files as Express.Multer.File[];
    const result = await replyToEmail(authReq, id, message, files);
    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Reply sent successfully',
      data: result,
    });
  }
);

const searchEmailsController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { query } = req.query;
    if (!query || typeof query !== 'string') {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Search query is required');
    }
    const results = await searchEmails(authReq, query);
    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Emails searched successfully',
      data: results,
    });
  }
);

const markEmailAsReadController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const result = await markEmailAsRead(authReq, id);
    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Email marked as read successfully',
      data: result,
    });
  }
);

const openEmailController = catchAsync(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { id } = req.params;
  const result = await openEmail(authReq, id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Email link provided successfully',
    data: result,
  });
});

const getPromptController = catchAsync(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { name } = req.params;
  const args = req.body.arguments;
  const prompt = await getPrompt(authReq, name, args);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Prompt retrieved successfully',
    data: prompt,
  });
});

const listPromptsController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const prompts = await listPrompts(authReq);
    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Prompts listed successfully',
      data: prompts,
    });
  }
);

const listToolsController = catchAsync(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tools = await listTools(authReq);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Tools listed successfully',
    data: tools,
  });
});

const summarizeEmailController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const summary = await summarizeEmail(authReq, id);
    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Email summarized successfully',
      data: summary,
    });
  }
);
const chatWithBotController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'Message is required and must be a string'
      );
    }
    const response = await chatWithBot(authReq, message);
    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Chat response generated',
      data: response,
    });
  }
);

export const MailController = {
  fetchEmails: fetchEmailsController,
  sendEmail: sendEmailController,
  readEmail: readEmailController,
  trashEmail: trashEmailController,
  archiveEmail: archiveEmailController,
  replyToEmail: replyToEmailController,
  searchEmails: searchEmailsController,
  markEmailAsRead: markEmailAsReadController,
  openEmail: openEmailController,
  getPrompt: getPromptController,
  listPrompts: listPromptsController,
  listTools: listToolsController,
  summarizeEmail: summarizeEmailController,
  chatWithBot: chatWithBotController,
};

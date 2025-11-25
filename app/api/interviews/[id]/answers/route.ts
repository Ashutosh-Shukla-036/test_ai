import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';

interface AnswerPayload {
  questionId: string;
  answer: string;
  score?: number;
  analysis?: any;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getAuthUser(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload: AnswerPayload = await request.json();

    if (!payload.questionId || !payload.answer) {
      return NextResponse.json(
        { error: 'Question ID and answer are required' },
        { status: 400 }
      );
    }

    // Fetch interview and verify ownership
    const interview = await prisma.interview.findFirst({
      where: { id: params.id, userId }
    });

    if (!interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    }

    // Upsert the question
    const question = await prisma.question.upsert({
      where: { id: payload.questionId },
      update: {
        userAnswer: payload.answer,
        score: payload.score ?? null,
        expectedAnswer: payload.analysis ? JSON.stringify(payload.analysis) : null
      },
      create: {
        id: payload.questionId,
        interviewId: params.id,
        category: 'project-based',
        questionText: 'Project-based question',
        userAnswer: payload.answer,
        score: payload.score ?? null,
        expectedAnswer: payload.analysis ? JSON.stringify(payload.analysis) : null
      }
    });

    // Update interview status if still PENDING
    if (interview.status === 'PENDING') {
      await prisma.interview.update({
        where: { id: params.id },
        data: { status: 'IN_PROGRESS' }
      });
    }

    return NextResponse.json({ success: true, question });
  } catch (error) {
    console.error('Error saving answer:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

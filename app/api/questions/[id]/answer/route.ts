import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { analyzeAnswer } from '@/lib/ai-services'; // evaluateAnswer replaced with analyzeAnswer

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getAuthUser(request);

    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { answer } = await request.json();
    if (!answer) return NextResponse.json({ error: 'Answer is required' }, { status: 400 });

    // Find question and verify ownership
    const question = await prisma.question.findFirst({
      where: { id: params.id, interview: { userId } },
      include: { interview: true }
    });
    if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

    // Analyze answer using AI
    const analysis = await analyzeAnswer(
      {
        id: question.id,
        projectTitle: question.questionText, // adapt if needed
        questionText: question.questionText,
        category: question.category as any,  // TS hack if category string issue
        expectedPoints: []
      },
      answer,
      { title: question.questionText, description: '', technologies: [] } // minimal Project object
    );

    // Update question in DB with userAnswer, score, feedback
    const updatedQuestion = await prisma.question.update({
      where: { id: params.id },
      data: {
        userAnswer: answer,
        score: analysis.score,
        feedback: JSON.parse(JSON.stringify(analysis))
      }
    });

    // Update interview status to IN_PROGRESS if still PENDING
    if (question.interview.status === 'PENDING') {
      await prisma.interview.update({
        where: { id: question.interviewId },
        data: { status: 'IN_PROGRESS' }
      });
    }

    // Return structured response
    return NextResponse.json({
      question: updatedQuestion,
      analysis
    });

  } catch (error) {
    console.error('Error submitting answer:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

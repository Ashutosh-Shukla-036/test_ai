import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import {
  generateInterviewFeedback,
  assessSkillLevel,
  Project,
  InterviewMetrics,
  AnswerAnalysis
} from '@/lib/ai-services';

interface CompleteRequestBody {
  answers: { analysis: AnswerAnalysis }[];
  projects: Project[];
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

    const body: CompleteRequestBody = await request.json();
    const { answers, projects } = body;

    // Fetch interview with questions
    const interview = await prisma.interview.findFirst({
      where: { id: params.id, userId },
      include: { questions: true }
    });

    if (!interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    }

    // Compute interview metrics safely
    const analyses: AnswerAnalysis[] = Array.isArray(answers)
      ? answers.map(a => a.analysis)
      : [];

    const numAnswers = analyses.length || 1;
    const totalDuration = analyses.reduce((sum, a) => sum + (a.responseTime || 0), 0);
    const totalWords = analyses.reduce((sum, a) => sum + (a.keywords?.length || 0), 0);
    const totalResponseTime = analyses.reduce((sum, a) => sum + (a.responseTime || 0), 0);
    const totalConfidence = analyses.reduce((sum, a) => sum + (a.confidence || 0), 0);
    const totalTechnicalDepth = analyses.reduce((sum, a) => sum + (a.technicalAccuracy || 0), 0);
    const totalCommunication = analyses.reduce((sum, a) => sum + (a.communicationClarity || 0), 0);
    const pauseCount = analyses.reduce((count, a) => count + ((a.responseTime || 0) > 30 && (a.keywords?.length || 0) < 5 ? 1 : 0), 0);

    const interviewMetrics: InterviewMetrics = {
      totalDuration,
      averageResponseTime: totalResponseTime / numAnswers,
      wordsPerMinute: totalWords,
      pauseCount,
      confidenceLevel: totalConfidence / numAnswers,
      technicalDepth: totalTechnicalDepth / numAnswers,
      communicationScore: totalCommunication / numAnswers,
      overallRating: totalTechnicalDepth / numAnswers > 70 ? 'Good' : 'Fair'
    };

    // Generate skill assessment
    const skillAssessment = await assessSkillLevel(Array.isArray(projects) ? projects : []);

    // Generate interview feedback
    const feedbackSummary = await generateInterviewFeedback(
      interviewMetrics,
      [],
      skillAssessment,
      Array.isArray(projects) ? projects : []
    );

    // Update interview
    const updatedInterview = await prisma.interview.update({
      where: { id: params.id },
      data: {
        status: 'COMPLETED',
        feedbackSummary
      },
      include: { questions: true }
    });

    return NextResponse.json({ interview: updatedInterview, feedback: feedbackSummary });
  } catch (error) {
    console.error('Error completing interview:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

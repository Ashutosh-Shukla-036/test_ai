'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRecoilState } from 'recoil';
import { currentInterviewState } from '@/store/atoms';
import AuthGuard from '@/components/AuthGuard';
import VideoInterviewInterface from '@/components/VideoInterviewInterface';
import {
  generateProjectQuestionsGuaranteed,
  InterviewQuestion,
  Project,
  AnswerAnalysis
} from '@/lib/ai-services';
import { toast } from 'sonner';

interface InterviewPageClientProps {
  params: { id: string };
}

export default function InterviewPageClient({ params }: InterviewPageClientProps) {
  const [currentInterview, setCurrentInterview] = useRecoilState(currentInterviewState);
  const [isLoading, setIsLoading] = useState(true);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const router = useRouter();

  // ===== Fetch Interview =====
  const fetchInterview = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

      const response = await fetch(`/api/interviews/${params.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!response.ok) {
        toast.error('Interview not found');
        router.push('/dashboard');
        return;
      }

      const data = await response.json();
      setCurrentInterview(data.interview);

      const safeProjects = Array.isArray(data.interview?.skills?.projects)
        ? data.interview.skills.projects
        : [];

      setProjects(safeProjects);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load interview');
      router.push('/dashboard');
    } finally {
      setIsLoading(false);
    }
  }, [params.id, router, setCurrentInterview]);

  // ===== Fetch on mount or when id changes =====
  useEffect(() => {
    if (!currentInterview || currentInterview.id !== params.id) {
      fetchInterview();
    } else {
      const safeProjects = Array.isArray(currentInterview?.skills?.projects)
        ? currentInterview.skills.projects
        : [];
      setProjects(safeProjects);
      setIsLoading(false);
    }
  }, [params.id, currentInterview, fetchInterview]);

  // ===== Generate Questions =====
  useEffect(() => {
    const generateQuestions = async () => {
      if (!projects || projects.length === 0 || questions.length > 0) return;

      setIsGeneratingQuestions(true);
      try {
        const generated = await generateProjectQuestionsGuaranteed(projects);
        if (Array.isArray(generated) && generated.length > 0) {
          setQuestions(generated);
        } else {
          console.warn('No questions generated.');
        }
      } catch (err) {
        console.error('Error generating questions:', err);
        toast.error('Failed to generate interview questions');
      } finally {
        setIsGeneratingQuestions(false);
      }
    };

    generateQuestions();
  }, [projects, questions.length]);

  // ===== Complete Interview =====
  const handleComplete = async (answers: { questionId: string; answer: string; analysis: AnswerAnalysis }[]) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

      // store answers sequentially
      for (const answerData of answers) {
        await fetch(`/api/interviews/${params.id}/answers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` })
          },
          body: JSON.stringify({
            questionId: answerData.questionId,
            answer: answerData.answer,
            score: answerData.analysis?.score ?? null,
            analysis: answerData.analysis || {}
          })
        });
      }

      // mark interview complete
      const completeResponse = await fetch(`/api/interviews/${params.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: JSON.stringify({
          answers,
          projects: Array.isArray(projects) ? projects : []
        })
      });

      if (!completeResponse.ok) throw new Error('Failed to complete interview');

      const data = await completeResponse.json();
      setCurrentInterview(data.interview);
      toast.success('Interview completed successfully!');
      router.push(`/interview/${params.id}/results`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to complete interview');
    }
  };

  // ===== Loading UI =====
  if (isLoading || isGeneratingQuestions) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-white text-lg">
              {isLoading ? 'Loading your interview...' : 'Generating interview questions...'}
            </p>
          </div>
        </div>
      </AuthGuard>
    );
  }

  // ===== No Interview =====
  if (!currentInterview) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <p className="text-white text-lg">Interview not found</p>
          </div>
        </div>
      </AuthGuard>
    );
  }

  // ===== Ready =====
  return (
    <AuthGuard>
      <VideoInterviewInterface
        interview={currentInterview}
        questions={questions}
        projects={projects}
        onComplete={handleComplete}
      />
    </AuthGuard>
  );
}

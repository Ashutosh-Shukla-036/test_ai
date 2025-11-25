'use client';

import dynamic from 'next/dynamic';

import { useState, useEffect } from 'react';
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

interface InterviewPageProps {
  params: { id: string };
}

function InterviewPage({ params }: InterviewPageProps) {
  const [currentInterview, setCurrentInterview] = useRecoilState(currentInterviewState);
  const [isLoading, setIsLoading] = useState(true);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const router = useRouter();

  // ===== Fetch interview if not already in recoil =====
  useEffect(() => {
    if (!currentInterview || currentInterview.id !== params.id) {
      fetchInterview();
    } else {
      const safeProjects = Array.isArray(currentInterview?.skills?.projects) ? currentInterview.skills.projects : [];
      setProjects(safeProjects);
      setIsLoading(false);
    }
  }, [params.id, currentInterview]);

  // ===== Generate & Guarantee Questions =====
  useEffect(() => {
    // ➤ Only run when projects are valid AND questions are not generated
    if (Array.isArray(projects) && projects.length > 0 && questions.length === 0) {
      setIsGeneratingQuestions(true);

      generateProjectQuestionsGuaranteed(projects)
        .then((generated) => {
          if (Array.isArray(generated) && generated.length > 0) {
            setQuestions(generated);
          } else {
            console.warn('No questions generated.');
          }
        })
        .catch((err) => {
          console.error('Error generating questions:', err);
          toast.error('Failed to generate interview questions');
        })
        .finally(() => setIsGeneratingQuestions(false));
    }
  }, [projects, questions.length]);

  // ===== Fetch Interview =====
  const fetchInterview = async () => {
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
  };

  // ===== Complete Interview =====
  const handleComplete = async (answers: { questionId: string; answer: string; analysis: AnswerAnalysis }[]) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

      // store answers
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

      if (completeResponse.ok) {
        const data = await completeResponse.json();
        setCurrentInterview(data.interview);
        toast.success('Interview completed successfully!');
        router.push(`/interview/${params.id}/results`);
      } else {
        throw new Error('Failed to complete interview');
      }
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

  // ===== Everything Ready =====
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

export default dynamic(() => Promise.resolve(InterviewPage), {
  ssr: false,
});
const AI_SERVICE = process.env.AI_SERVICE || 'local';
const RESUME_PARSER = process.env.RESUME_PARSER || 'local';
const HF_API_KEY = process.env.HF_API_KEY;
const HF_ANALYSIS_MODEL = 'cardiffnlp/twitter-roberta-base-sentiment-latest';

console.log(`✓ AI Service initialized: ${AI_SERVICE}`);
console.log(`✓ Resume Parser: ${RESUME_PARSER}`);
if (HF_API_KEY) {
  console.log('✓ HuggingFace API key configured');
} else {
  console.log('⚠️ HuggingFace API key not found, using local parsing & analysis only');
}

export interface Project {
  title: string;
  description: string;
  technologies?: string[];
  duration?: string;
  role?: string;
  achievements?: string[];
}

export interface InterviewQuestion {
  id: string;
  projectTitle: string;
  questionText: string;
  category: string;
  expectedPoints: string[];
}

export interface AnswerAnalysis {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  technicalAccuracy: number;
  communicationClarity: number;
  problemSolvingApproach: number;
  sentiment: string;
  confidence: number;
  keywords: string[];
  responseTime: number;
  complexity: 'basic' | 'intermediate' | 'advanced';
  industryRelevance: number;
  codeQuality?: number;
}

export interface InterviewMetrics {
  totalDuration: number;
  averageResponseTime: number;
  wordsPerMinute: number;
  pauseCount: number;
  confidenceLevel: number;
  technicalDepth: number;
  communicationScore: number;
  overallRating: 'Poor' | 'Fair' | 'Good' | 'Excellent';
}

export interface ComparisonData {
  userScore: number;
  industryAverage: number;
  topPerformers: number;
  category: string;
}

export async function parseResumeWithAI(resumeText: string): Promise<{ projects: Project[] }> {
  if (!resumeText || resumeText.trim().length < 50) {
    return { projects: [] };
  }

  console.log('🔍 Starting resume parsing...');
  
  let projects: Project[] = [];
  
  if (HF_API_KEY) {
    try {
      projects = await parseWithLLM(resumeText);
      if (projects.length > 0) {
        console.log(`✅ LLM parsed ${projects.length} projects`);
        return { projects };
      }
    } catch (err) {
      console.warn('LLM parsing failed:', err);
    }
  }
  
  projects = parseWithSmartRegex(resumeText);
  if (projects.length > 0) {
    console.log(`✅ Regex parsed ${projects.length} projects`);
    return { projects };
  }
  
  projects = emergencyTechExtraction(resumeText);
  console.log(`✅ Emergency extracted ${projects.length} projects`);
  
  return { projects };
}

async function parseWithLLM(resumeText: string): Promise<Project[]> {
  const prompt = `Extract all technical projects from this resume. Return ONLY a JSON array of project objects with: title, description, technologies[], achievements[].

Resume:
${resumeText.slice(0, 3000)}

Format: [{"title": "...", "description": "...", "technologies": ["...", "..."], "achievements": ["..."]}]`;

  try {
    const response = await fetchWithTimeout(
      'https://router.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { max_new_tokens: 1024, temperature: 0.1, return_full_text: false }
        })
      },
      10000
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const text = extractTextFromHFResponse(result);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const projects = JSON.parse(jsonMatch[0]);
      if (Array.isArray(projects)) return projects.filter(p => p.title && p.description).slice(0, 5);
    }
  } catch (error) {
    console.warn('LLM parsing failed:', error);
  }

  return [];
}

function extractTextFromHFResponse(result: any): string {
  if (Array.isArray(result) && result[0]?.generated_text) return result[0].generated_text;
  if (result.generated_text) return result.generated_text;
  if (typeof result === 'string') return result;
  if (Array.isArray(result) && result[0]?.text) return result[0].text;
  return JSON.stringify(result);
}

function parseWithSmartRegex(text: string): Project[] {
  const projects: Project[] = [];
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const sections = extractProjectSections(cleanText);

  for (const section of sections) {
    const project = parseProjectSection(section);
    if (project && isValidProject(project)) projects.push(project);
  }

  return projects.slice(0, 4);
}

function extractProjectSections(text: string): string[] {
  const sections: string[] = [];
  const headingRegex = /(?:^|\n)(?:(?:PROJECTS?|TECHNICAL PROJECTS?|PERSONAL PROJECTS?)[\s\S]*?)(?=\n(?:EDUCATION|SKILLS|EXPERIENCE|CERTIFICATIONS|$))/i;
  const headingMatch = text.match(headingRegex);
  if (headingMatch) {
    const bullets = headingMatch[0].split(/(?:\n\s*[•\-*]\s*|\n\s*\d+\.\s*)/).filter(b => b.length > 50);
    sections.push(...bullets);
  }

  const patterns = [
    /(?:^|\n)([A-Z][^•\n]{10,80}?)(?:\n|$)((?:[^•\n]*(?:\n|$)){1,5})/g,
    /(?:Title|Project):\s*([^\n]+)(?:\n|$)((?:[^•\n]*(?:\n|$)){1,5})/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const title = match[1]?.trim();
      const desc = match[2]?.trim();
      if (title && desc && title.length > 5 && desc.length > 20) sections.push(`${title}\n${desc}`);
    }
  }

  return sections.filter(s => s.length > 30);
}

function parseProjectSection(section: string): Project | null {
  const lines = section.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 1) return null;
  const title = lines[0].replace(/^[•\-*\d\.\s]+/, '').trim();
  const description = lines.slice(1).join(' ').trim() || title;

  const techKeywords = ['react','node','python','java','javascript','typescript','mongodb','sql','postgres','mysql','docker','kubernetes','aws','azure','gcp','express','next','vue','angular','django','flask','spring','fastapi','graphql','rest','api','html','css','tailwind','bootstrap','git','github','jenkins','ml','ai','tensorflow','pytorch','xgboost','pandas','numpy'];
  const techRegex = new RegExp(`\\b(${techKeywords.join('|')})\\b`, 'gi');
  const technologies = Array.from(new Set((description.match(techRegex) || []).map(t => t.toLowerCase())));

  const achievements = description.split(/[.;!?]/).filter(sentence => sentence.length > 15 && /(built|developed|created|implemented|designed|optimized|improved|reduced|increased|deployed|architected)/i.test(sentence)).map(s => s.trim()).slice(0,3);

  return { title: title.slice(0,100), description: description.slice(0,500), technologies, achievements: achievements.length ? achievements : undefined };
}

function isValidProject(project: Project): boolean {
  if (!project.title || project.title.length < 3) return false;
  if (!project.description || project.description.length < 10) return false;
  const invalidPatterns = [/cgpa|gpa|percentage|grade|university|college|school|degree|b\.?tech|b\.?e|m\.?tech|phd/i,/skills?|languages?|tools?|frameworks?|certifications?|awards?|hackathon|competition/i];
  if (invalidPatterns.some(p => p.test(project.title))) return false;
  if (invalidPatterns.some(p => p.test(project.description))) return false;
  return true;
}

function emergencyTechExtraction(text: string): Project[] {
  const projects: Project[] = [];
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.length > 80);
  let projectCount = 0;

  for (const para of paragraphs) {
    if (projectCount >= 3) break;
    const techWords = para.match(/\b(react|node|python|java|javascript|typescript|mongodb|sql|docker|api|ml|ai|express|database|backend|frontend|full.?stack)\b/gi);
    if (techWords && techWords.length >= 2) {
      const firstLine = para.split('\n')[0].trim();
      const title = firstLine.length > 10 ? firstLine.slice(0, 60) : `Project ${projectCount+1}`;
      if (!projects.some(p => p.title === title)) {
        projects.push({ title, description: para.slice(0,400), technologies: Array.from(new Set((techWords||[]).map(t=>t.toLowerCase()))), achievements: extractKeyAchievements(para) });
        projectCount++;
      }
    }
  }

  return projects;
}

function extractKeyAchievements(text: string): string[] {
  return text.split(/[.;!?]/).filter(s => s.length>20 && /(reduced|improved|increased|built|developed|created|implemented|optimized|deployed|achieved|solved)/i.test(s)).map(s=>s.trim().replace(/^[•\-*\s]+/,'')).slice(0,3);
}

// =========================
// 🎯 PROJECT QUESTIONS (KEEP EXISTING)
// =========================

// Accept a comma-separated list of HF models in env, fallback to these two
const HF_QUESTION_MODELS = "meta-llama/Llama-3.2-3B-Instruct";

// small fetch timeout helper
async function fetchWithTimeout(url: string, opts: any = {}, timeoutMs = 9000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}


export async function generateProjectQuestions(projects: Project[]): Promise<InterviewQuestion[]> {
  const questions: InterviewQuestion[] = [];

  if (!Array.isArray(projects) || projects.length === 0) {
    // immediate fallback
    return generateQuestionsLocallyFallbackAll();
  }

  // Try to generate per project
  for (const project of projects.slice(0, 3)) {
    let produced: InterviewQuestion[] = [];

    // If HF configured and key present, try model list
    if (HF_API_KEY) {
      for (const modelId of HF_QUESTION_MODELS) {
        try {
          produced = await generateQuestionsWithHuggingFaceModel(project, modelId);
          if (Array.isArray(produced) && produced.length > 0) {
            // stop at first working model
            break;
          }
        } catch (err) {
          console.warn(`HF model ${modelId} failed for project "${project.title}":`, err);
          // try next model
        }
      }
    }

    // If HF didn't produce valid questions, fallback locally
    if (!produced || produced.length === 0) {
      produced = generateQuestionsLocally(project);
    }

    questions.push(...produced);
  }

  return dedupeQuestions(questions);
}

async function generateQuestionsWithHuggingFaceModel(project: Project, modelId: string): Promise<InterviewQuestion[]> {
  if (!modelId) throw new Error('No model specified');

  const prompt = `Generate 4 concise interview questions for the following project. Return ONLY a JSON array of objects with keys: questionText, category, expectedPoints.

Project: ${project.title}
Description: ${project.description}
Technologies: ${(project.technologies || []).slice(0,6).join(', ')}`;

  const url = `https://router.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct`;
  const body = {
    inputs: prompt,
    parameters: { max_new_tokens: 400, temperature: 0.25, return_full_text: false }
  };

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HF_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }, 9000);

  if (!resp.ok) throw new Error(`HF ${modelId} HTTP ${resp.status}`);

  const result = await resp.json();
  const text = extractTextFromHFResponse(result);
  const jsonMatch = text.match(/\[[\s\S]*\]/);

  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((q: any, idx: number) => ({
          id: `${slugify(project.title)}-${idx + 1}`,
          projectTitle: project.title,
          questionText: (q.questionText || q.question || q.prompt || 'No question').toString(),
          category: (q.category || q.type || 'technical'),
          expectedPoints: Array.isArray(q.expectedPoints) ? q.expectedPoints : (q.points ? q.points : [])
        }));
      }
    } catch (err) {
      console.warn('Failed to parse HF JSON array result:', err);
    }
  }

  // fallback: split lines if JSON fails
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const extracted: InterviewQuestion[] = [];
  for (let i = 0; i < lines.length && extracted.length < 4; i++) {
    const line = lines[i].replace(/^[0-9\.\-\)\s]+/, '').trim();
    if (line.length > 20) {
      extracted.push({
        id: `${slugify(project.title)}-hf-${i}`,
        projectTitle: project.title,
        questionText: line,
        category: 'technical',
        expectedPoints: []
      });
    }
  }

  return extracted;
}

function slugify(s: string) {
  return (s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

export function generateQuestionsLocallyFallbackAll(): InterviewQuestion[] {
  // If you have no projects, produce general fallback questions
  return [
    {
      id: 'local-fallback-1',
      projectTitle: 'General',
      questionText: 'Tell me about a recent project you built. What problem did it solve?',
      category: 'technical',
      expectedPoints: ['Problem statement', 'Your role', 'Key technologies']
    },
    {
      id: 'local-fallback-2',
      projectTitle: 'General',
      questionText: 'What technical challenge did you face in your projects and how did you solve it?',
      category: 'problem-solving',
      expectedPoints: ['Challenge', 'Approach', 'Result']
    },
    {
      id: 'local-fallback-3',
      projectTitle: 'General',
      questionText: 'How do you evaluate trade-offs when designing an architecture?',
      category: 'architecture',
      expectedPoints: ['Trade-offs', 'Scalability', 'Performance']
    },
    {
      id: 'local-fallback-4',
      projectTitle: 'General',
      questionText: 'What would you improve in a past project if you rewrote it today?',
      category: 'behavioral',
      expectedPoints: ['Learnings', 'Refactor ideas', 'Impact']
    }
  ];
}

// Local fallback for a single project (when HF fails)
function generateQuestionsLocally(project: Project): InterviewQuestion[] {
  return [
    {
      id: `${slugify(project.title)}-local-1`,
      projectTitle: project.title,
      questionText: `Explain the core problem your project "${project.title}" solves.`,
      category: 'technical',
      expectedPoints: ['Problem definition', 'Use case', 'Impact']
    },
    {
      id: `${slugify(project.title)}-local-2`,
      projectTitle: project.title,
      questionText: `Walk me through the architecture of "${project.title}".`,
      category: 'architecture',
      expectedPoints: ['Tech stack', 'Flow', 'Design decisions']
    },
    {
      id: `${slugify(project.title)}-local-3`,
      projectTitle: project.title,
      questionText: `What was the biggest challenge while building "${project.title}"?`,
      category: 'problem-solving',
      expectedPoints: ['Obstacle', 'Your solution', 'Outcome']
    },
    {
      id: `${slugify(project.title)}-local-4`,
      projectTitle: project.title,
      questionText: `If you had more time, what would you improve in "${project.title}"?`,
      category: 'improvement',
      expectedPoints: ['Optimization ideas', 'Better tech choices', 'Performance']
    }
  ];
}

// Avoid duplicate questions
function dedupeQuestions(qs: InterviewQuestion[]): InterviewQuestion[] {
  const seen = new Set();
  return qs.filter(q => {
    const key = q.questionText.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function generateProjectQuestionsGuaranteed(projects: Project[]): Promise<InterviewQuestion[]> {
  try {
    const q = await generateProjectQuestions(projects);
    if (Array.isArray(q) && q.length > 0) return q;
  } catch (err) {
    console.warn('generateProjectQuestions threw, falling back:', err);
  }
  // final safe fallback
  return generateQuestionsLocallyFallbackAll();
}

/* ====================
   ANSWER ANALYSIS
  ==================== */

export async function analyzeAnswer(
  question: InterviewQuestion,
  userAnswer: string,
  project: Project
): Promise<AnswerAnalysis> {
  console.log(`🔍 Analyzing answer for question: ${question.id}`);
  if (!userAnswer || userAnswer.trim().length === 0) {
    // return safe empty analysis
    return generateStructuredAnalysis('', 'neutral', 30, question);
  }

  if (AI_SERVICE === 'huggingface' && HF_API_KEY) {
    try {
      return await analyzeAnswerWithHuggingFace(question, userAnswer);
    } catch (err) {
      console.warn('HuggingFace analysis failed, using local analysis:', err);
      return generateStructuredAnalysis(userAnswer, 'neutral', 50, question);
    }
  }

  return generateStructuredAnalysis(userAnswer, 'neutral', 50, question);
}

async function analyzeAnswerWithHuggingFace(question: InterviewQuestion, userAnswer: string): Promise<AnswerAnalysis> {
  const resp = await fetchWithTimeout(`https://router.huggingface.co/models/${HF_ANALYSIS_MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HF_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ inputs: userAnswer })
  }, 9000);

  let sentiment = 'neutral';
  let confidence = 50;

  if (resp.ok) {
    try {
      const result = await resp.json();
      if (Array.isArray(result) && result[0]) {
        const top = result[0][0] || result[0];
        if (top && top.label) {
          const lab = top.label.toLowerCase();
          sentiment = lab.includes('pos') || lab.includes('positive') ? 'positive' :
                      lab.includes('neg') || lab.includes('negative') ? 'negative' : 'neutral';
          confidence = Math.round((top.score || 0.5) * 100);
        }
      } else if (result && result.label) {
        const lab = result.label.toLowerCase();
        sentiment = lab.includes('pos') ? 'positive' : lab.includes('neg') ? 'negative' : 'neutral';
        confidence = Math.round((result.score || 0.5) * 100);
      }
    } catch (err) {
      console.warn('Failed to parse HF sentiment result', err);
    }
  } else {
    console.warn('HF sentiment API returned non-OK:', resp.status);
  }

  return generateStructuredAnalysis(userAnswer, sentiment, confidence, question);
}

function generateStructuredAnalysis(
  userAnswer: string,
  sentiment: string,
  confidence: number,
  question: InterviewQuestion
): AnswerAnalysis {
  const clean = (userAnswer || '').trim();
  const wordCount = clean.length === 0 ? 0 : clean.split(/\s+/).length;
  const hasExamples = /example|instance|case|for example|such as|like when/i.test(clean);
  const hasTechnicalTerms = /algorithm|architecture|implementation|api|database|performance|latency|scalability|deploy|container|docker|kubernetes|thread|async|lambda|queue|cache|redis|mongodb|postgres|sql|rest|graphql/i.test(clean);
  const hasMetrics = /\b\d+%|\b\d+\s*x|\b\d+\s+ms|\b\d+\s+sec|\b\d+\s+seconds|\bimprov(ed|ement)|reduc(ed|tion)\b/i.test(clean);

  const base = Math.min(50, wordCount);
  const score = Math.min(95, Math.max(20, base + (hasTechnicalTerms ? 15 : 0) + (hasExamples ? 10 : 0) + (hasMetrics ? 10 : 0)));

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];

  if (wordCount > 80) strengths.push('Comprehensive detail and elaboration');
  if (hasTechnicalTerms) strengths.push('Used relevant technical vocabulary');
  if (hasExamples) strengths.push('Provided concrete examples');
  if (hasMetrics) strengths.push('Included measurable outcomes');

  if (wordCount < 40) weaknesses.push('Answer is brief; expand with specifics');
  if (!hasTechnicalTerms && question.category === 'technical') weaknesses.push('Add more technical depth and terminology');
  if (!hasExamples) weaknesses.push('Include specific examples or scenarios');

  suggestions.push('Link answers to measurable outcomes or architecture diagrams when possible.');
  if (question.category === 'problem-solving' && !hasMetrics) suggestions.push('Quantify the impact (e.g., "reduced latency by 30%")');

  return {
    score,
    strengths,
    weaknesses,
    suggestions,
    technicalAccuracy: hasTechnicalTerms ? 75 : 50,
    communicationClarity: wordCount > 30 ? 75 : 45,
    problemSolvingApproach: (hasExamples || hasMetrics) ? 80 : 60,
    sentiment: sentiment || 'neutral',
    confidence: typeof confidence === 'number' ? confidence : 50,
    keywords: extractKeywords(userAnswer),
    responseTime: Math.round(Math.random() * 20 + 5),
    complexity: wordCount > 120 ? 'advanced' : wordCount > 50 ? 'intermediate' : 'basic',
    industryRelevance: hasTechnicalTerms ? 75 : 50,
    codeQuality: hasTechnicalTerms ? 60 : 45
  };
}

function extractKeywords(text: string): string[] {
  if (!text) return [];
  const common = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'but', 'or', 'to', 'in', 'of', 'i', 'my', 'me', 'we', 'our', 'on', 'at', 'with', 'for', 'from', 'by', 'as', 'it', 'its', 'this', 'that', 'they', 'them', 'their']);
  const tokens = (text || '').toLowerCase().split(/\W+/).filter(w => w.length > 2 && !common.has(w));
  const counts: Record<string, number> = {};
  for (const t of tokens) counts[t] = (counts[t] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
}

export async function assessSkillLevel(projects: Project[]): Promise<{
  level: 'Junior' | 'Mid-Level' | 'Senior' | 'Lead';
  yearsEstimate: string;
  strengths: string[];
  recommendations: string[];
}> {
  if (!Array.isArray(projects) || projects.length === 0) {
    return { level: 'Junior', yearsEstimate: '0-2 years', strengths: ['Basic foundation'], recommendations: ['Build more projects'] };
  }

  const techCount = new Set(projects.flatMap(p => p.technologies || [])).size;
  const projectComplexity = projects.reduce((sum, p) => {
    let complexity = 1;
    if ((p.technologies || []).length > 5) complexity += 1;
    if ((p.description || '').length > 200) complexity += 1;
    if (p.achievements && p.achievements.length > 0) complexity += 1;
    if (p.role && /lead|senior|architect/i.test(p.role)) complexity += 1;
    return sum + complexity;
  }, 0) / projects.length;

  let level: 'Junior' | 'Mid-Level' | 'Senior' | 'Lead';
  let yearsEstimate: string;
  const strengths: string[] = [];
  const recommendations: string[] = [];

  if (techCount >= 15 && projectComplexity >= 3.5) {
    level = 'Lead'; yearsEstimate = '7+ years';
    strengths.push('Extensive technology stack', 'Complex project experience', 'Leadership');
    recommendations.push('Focus on strategic decisions and mentoring');
  } else if (techCount >= 10 && projectComplexity >= 2.5) {
    level = 'Senior'; yearsEstimate = '4-7 years';
    strengths.push('Strong technical foundation', 'Diverse projects');
    recommendations.push('Deepen system design and leadership skills');
  } else if (techCount >= 6 && projectComplexity >= 2) {
    level = 'Mid-Level'; yearsEstimate = '2-4 years';
    strengths.push('Solid project experience', 'Growing expertise');
    recommendations.push('Expand architecture knowledge and scale-up experience');
  } else {
    level = 'Junior'; yearsEstimate = '0-2 years';
    strengths.push('Foundation skills', 'Eagerness to learn');
    recommendations.push('Build more portfolio projects and focus on core CS concepts');
  }

  // top techs
  const topTechs = projects.flatMap(p => p.technologies || []).reduce((acc: Record<string, number>, t) => {
    acc[t] = (acc[t] || 0) + 1; return acc;
  }, {});
  const sortedTechs = Object.entries(topTechs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
  if (sortedTechs.length) strengths.unshift(`Strong in ${sortedTechs.join(', ')}`);

  return { level, yearsEstimate, strengths, recommendations };
}


export function generateIndustryComparison(score: number): ComparisonData[] {
  const s = typeof score === 'number' && !isNaN(score) ? Math.max(0, Math.min(100, Math.round(score))) : 60;
  return [
    { userScore: s, industryAverage: 65, topPerformers: 85, category: 'Technical Skills' },
    { userScore: Math.max(0, s - 5), industryAverage: 70, topPerformers: 88, category: 'Communication' },
    { userScore: Math.min(100, s + 3), industryAverage: 62, topPerformers: 82, category: 'Problem Solving' },
    { userScore: Math.max(0, s - 2), industryAverage: 68, topPerformers: 86, category: 'System Design' }
  ];
}

export async function generateInterviewFeedback(
  interviewMetrics: InterviewMetrics,
  comparisonData: ComparisonData[] = [],
  skillAssessment: Awaited<ReturnType<typeof assessSkillLevel>>,
  projects: Project[] = []
): Promise<string> {
  // Defensive defaults
  interviewMetrics = interviewMetrics || ({} as InterviewMetrics);
  const totalDuration = Number(interviewMetrics.totalDuration || 0);
  const confidenceLevel = Number(interviewMetrics.confidenceLevel || 0);
  const technicalDepth = Number(interviewMetrics.technicalDepth || 0);
  const communicationScore = Number(interviewMetrics.communicationScore || 0);
  const averageResponseTime = Number(interviewMetrics.averageResponseTime || 0);
  const overallRating = interviewMetrics.overallRating || 'Fair';

  skillAssessment = skillAssessment || { level: 'Junior', yearsEstimate: '0-2 years', strengths: [], recommendations: [] };

  // safe comparison data mapping
  const compData = Array.isArray(comparisonData) ? comparisonData : [];

  const projectsSummary = (Array.isArray(projects) ? projects.map(p => p.title).join(', ') : '') || 'various development projects';

  return `# Interview Summary Report: ${overallRating} Performance

## Overall Performance
Your interview performance was rated as ${overallRating}. During the ${Math.round(totalDuration / 60)}-minute session, you maintained a confidence level of ${Math.round(confidenceLevel)}% and demonstrated a skill level of **${skillAssessment.level}** (${skillAssessment.yearsEstimate} experience).

## Technical Assessment
Your technical depth scored ${technicalDepth.toFixed(1)}% with a communication score of ${communicationScore.toFixed(1)}%. You discussed projects including: ${projectsSummary}.

## Key Strengths
${(skillAssessment.strengths && skillAssessment.strengths.length > 0) ? skillAssessment.strengths.map(s => `- ${s}`).join('\n') : '- Demonstrated foundational skills'}

## Recommendations for Growth
${(skillAssessment.recommendations && skillAssessment.recommendations.length > 0) ? skillAssessment.recommendations.map(r => `- ${r}`).join('\n') : '- Keep building projects and practice problem solving'}

## Industry Comparison
${compData.length > 0 ? compData.map(c => `- ${c.category}: ${c.userScore}/100 (Industry average: ${c.industryAverage})`).join('\n') : '- No comparison data available'}

---

Keep building on your strengths and focus on measurable impact in your answers (metrics, performance, cost/time improvements).`;

} // end file

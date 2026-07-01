// Funnel definition for the Lemon Pros lemon-law qualification quiz.
// Order: Car Year → Car Make → Car Model → Name → Phone → Email.
// Step types: 'year', 'make', 'model', 'name', 'phone', 'email'.

export const FUNNEL_STEPS = [
  {
    id: 'year',
    field: 'car_year',
    question: 'What year is your vehicle?',
    subtitle: 'Select the model year of your vehicle.',
    type: 'year',
  },
  {
    id: 'make',
    field: 'car_make',
    question: "What's the make of your vehicle?",
    subtitle: 'Choose your vehicle manufacturer.',
    type: 'make',
  },
  {
    id: 'model',
    field: 'car_model',
    question: 'Which model do you drive?',
    subtitle: 'Select your vehicle model.',
    type: 'model',
  },
  {
    id: 'name',
    question: 'What is your name?',
    subtitle: 'Your information is safe & secure.',
    type: 'name',
  },
  {
    id: 'phone',
    question: "What's the best phone number to reach you?",
    subtitle: 'A specialist will call to review your case — free of charge.',
    type: 'phone',
  },
  {
    id: 'email',
    question: 'Last step — where should we send your free case review?',
    subtitle: 'We take privacy seriously. No spam, ever.',
    type: 'email',
  },
];

export const STEP_IDS = FUNNEL_STEPS.map((s) => s.id);

// Active steps for a given session. When the visitor already picked their make on
// a landing page (e.g. the /pa make grid sets `make_locked`), the in-funnel make
// step is dropped so they don't pick it twice.
export function getActiveStepIds(answers = {}) {
  return STEP_IDS.filter((id) => !(id === 'make' && answers && answers.make_locked));
}

export function getStepIndex(stepId) {
  return STEP_IDS.indexOf(stepId);
}

export function getStep(stepId) {
  return FUNNEL_STEPS.find((s) => s.id === stepId);
}

// Tailwind-safe color classes (kept for any future colorful option steps).
export const ICON_COLORS = {
  green: { wrap: 'bg-green-50 border-green-200', icon: 'text-green-600' },
  emerald: { wrap: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-600' },
  red: { wrap: 'bg-red-50 border-red-200', icon: 'text-red-500' },
  blue: { wrap: 'bg-blue-50 border-blue-200', icon: 'text-blue-600' },
  amber: { wrap: 'bg-amber-50 border-amber-200', icon: 'text-amber-500' },
  yellow: { wrap: 'bg-yellow-50 border-yellow-200', icon: 'text-yellow-600' },
  slate: { wrap: 'bg-slate-50 border-slate-200', icon: 'text-slate-700' },
};

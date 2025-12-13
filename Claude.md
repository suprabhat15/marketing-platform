## Table of Contents 1. [AWS SES Setup](#aws-ses-setup) 2. [Project Initialization](#project-initialization) 3. [Database Schema](#database-schema) 4. [Environment Configuration](#environment-configuration) 5. [Authentication Setup](#authentication-setup) 6. [API Routes](#api-routes) 7. [SES Integration](#ses-integration) 8. [SNS Bounce/Complaint Handling](#sns-bounce-complaint-handling) 9. [Email Broadcasting](#email-broadcasting) 10. [UI Components](#ui-components) 11. [Tracking Implementation](#tracking-implementation) 12. [Automation/Cron Jobs](#automation-cron-jobs) 13. [Deployment](#deployment)

## Code Style
- Formatting: Prettier with tailwind plugin
- TypeScript: Strong typing, avoid any, use Zod for validation
- CSS/Styling: Use Tailwind CSS utility classes, focus on responsive design
- Component Structure: Create reusable, well-structured components with proper TypeScript interfaces
- State Management: Use React hooks (useState, useEffect) and context when needed
- Error Handling: Implement proper error boundaries and user-friendly error messages
- Performance: Optimize components with React.memo, useMemo, useCallback where appropriate
- Accessibility: Follow WCAG guidelines, proper ARIA labels, semantic HTML
- Testing: Write unit tests for components and utility functions
- Code Organization: Group related files, use barrel exports, maintain clean folder structure

## Tech Stack
- Frontend: Next.js, React, TypeScript, TailwindCSS, Shadcn UI
- Backend: Node.js, Prisma ORM
- Database: PostgreSQL
- Authentication: Better Auth, Google OAuth

## UI/UX Guidelines
- Design System: Consistent spacing, typography, and color schemes using Tailwind
<!-- - Mobile-First: Design and develop with mobile-first responsive approach -->
- User Experience: Intuitive navigation, clear call-to-actions, loading states
- Visual Hierarchy: Proper use of headings, spacing, and visual weight
- Interactive Elements: Hover states, focus indicators, smooth transitions
- Feedback: Loading spinners, success/error messages, progress indicators 
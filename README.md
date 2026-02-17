# MailPackr

MailPackr is a modern, developer-first email marketing platform designed for high deliverability and ease of use. Built with Next.js 15, it provides a robust infrastructure for creating, scheduling, and tracking email campaigns, leveraging AWS SES for sending and Polar.sh for subscription management.

## Features

- **Campaign Management**: Create, schedule, and manage email campaigns with ease.
- **Visual Email Editor**: Drag-and-drop editor powered by Tiptap, supporting custom HTML templates.
- **Advanced Analytics**: Real-time tracking of opens, clicks, bounces, complaints, and delivery rates.
- **Subscriber Management**: Robust list management with import capabilities and segmentation.
- **Domain Verification**: Secure sending with automated DKIM/SPF verification handling.
- **Credit System**: Integrated with Polar.sh for credit-based usage and subscription billing.
- **Reliable Background Jobs**: Uses Redis and BullMQ for reliable background job processing.
- **Authentication**: Secure authentication via Better Auth (Email/Password + Google OAuth).
- **Developer Friendly**: Built with modern tech stack, fully typed, and easy to extend.

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4, Shadcn/UI, Lucide React
- **Database**: PostgreSQL (via [Prisma ORM](https://www.prisma.io/))
- **Queue & Caching**: Redis (Upstash/IOredis), BullMQ, AWS SQS
- **Email Service**: AWS SES
- **Authentication**: Better Auth
- **Payments**: Polar.sh SDK

## Architecture

MailPackr uses a queue-based architecture to handle high-volume email sending reliably.

```mermaid
graph TD
    subgraph Client
        User[User / Browser]
    end

    subgraph "Next.js Application Server"
        API[API Routes (app/api/*)]
        UI[UI Components]
    end

    subgraph "Data & State"
        Postgres[(PostgreSQL DB)]
        Redis[(Redis Cache & Queues)]
    end

    subgraph "Job Processing (BullMQ)"
        CampaignQueue[Campaign Queue]
        BatchQueue[Batch Queue]
        CampaignWorker[Campaign Worker]
        BatchWorker[Batch Email Processor]
    end

    subgraph "External Services"
        SES[AWS SES]
        Polar[Polar Billing]
    end

    %% Flows
    User -->|Interacts| UI
    UI -->|Requests| API
    
    %% Campaign Sending Flow
    API -->|1. Validate & Deduct| Polar
    API -->|2. Enqueue Campaign| CampaignQueue
    
    CampaignQueue -->|3. Process Campaign| CampaignWorker
    CampaignWorker -->|4. Fetch Campaign & Subscribers| Postgres
    CampaignWorker -->|5. Create Batches| BatchQueue
    
    BatchQueue -->|6. Process Batch| BatchWorker
    BatchWorker -->|7. Check Rate Limit| Redis
    BatchWorker -->|8. Personalize & Send| SES
    BatchWorker -->|9. Log Events| Postgres
    
    %% Feedback Loop
    SES -.->|Webhooks (Bounces/Complaints)| API
    API -->|Update Subscriber Status| Postgres

    %% Connections
    CampaignWorker -.->|Uses| Redis
    BatchWorker -.->|Uses| Redis
    API -.->|Uses| Postgres
```

### Core Components

*   **Next.js App Router**: Handles UI and API requests.
*   **BullMQ & Redis**: Manages background jobs for campaign processing and batch sending.
*   **BatchEmailProcessor**: Consumes email batches, personalizes content, and sends via SES.
*   **AWS SES**: Delivers emails with high deliverability.
*   **Polar.sh**: Manages credits and subscriptions.

For a deep dive into the system's internal workflows, design patterns, and scalability analysis, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v20.9.0 or higher)
- [PostgreSQL](https://www.postgresql.org/)
- [Redis](https://redis.io/)
- An AWS Account with SES access
- A Polar.sh account (for payments/credits)
- Google Cloud Console Project (for OAuth)

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/mailpackr.git
    cd mailpackr
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Configuration:**
    Copy the example environment file and update it with your credentials:
    ```bash
    cp .env.example .env
    ```
    Required variables include:
    - **Database**: `DATABASE_URL`
    - **AWS**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
    - **Redis**: `REDIS_URL`, `REDIS_TOKEN`
    - **Auth**:
        - `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
        - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (for Google Login)
    - **Polar (Payments)**:
        - `POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`
        - `POLAR_WEBHOOK_SECRET` (for verifying webhooks)
        - `NEXT_PUBLIC_POLAR_PRODUCT_ID_10K`, `NEXT_PUBLIC_POLAR_PRODUCT_ID_20K` (Credit pack IDs)

4.  **Database Setup:**
    Run migrations to set up your database schema:
    ```bash
    npm run db:migrate
    ```

5.  **Seed Database (Optional):**
    ```bash
    npm run prisma:seed
    ```

## Usage

### Development Server
Start the development server with hot-reloading:
```bash
npm run dev
```
Visit `http://localhost:3000` to access the application.

### Production Build
To create a production build:
```bash
npm run build
npm start
```

## Configuration Details

### Webhooks
The application uses webhooks for real-time updates:
- **Polar Webhooks**: Configured at `/api/payments/webhooks`. Ensure your `POLAR_WEBHOOK_SECRET` matches the one in your Polar dashboard.
- **SES Webhooks**: Configure SES to send bounce/complaint notifications to `/api/events` (or your configured endpoint) to maintain list hygiene.

## Testing

### Linting & Type Checking
Ensure code quality and type safety:
```bash
npm run lint
npm run type-check
```

### Load Testing
A simple load testing script is included to test basic endpoint performance:
```bash
node load-test.js
```

## Project Structure

- `app/`: Next.js App Router pages and API routes.
- `components/`: Reusable UI components (Shadcn/UI, custom).
- `lib/`: Core business logic, service integrations (AWS, Redis, Polar), and utilities.
- `prisma/`: Database schema and migrations.
- `public/`: Static assets.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

For support or queries, please open an issue in the repository.
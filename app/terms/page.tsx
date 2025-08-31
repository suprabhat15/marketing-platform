import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <nav className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <Mail className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">
                MailPackr
              </span>
            </Link>
            <Button variant="outline" asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-lg bg-white p-8 shadow-sm">
          <h1 className="mb-8 text-3xl font-bold text-gray-900">
            Terms of Service
          </h1>

          <div className="prose prose-gray max-w-none">
            <p className="mb-6 text-gray-600">
              <strong>Effective Date:</strong> {new Date().toLocaleDateString()}
            </p>

            <section className="mb-8">
              <h2 className="mb-4 text-2xl font-semibold text-gray-900">
                1. Acceptance of Terms
              </h2>
              <p className="leading-relaxed text-gray-600">
                By accessing and using MailPackr ("the Service"), you accept and
                agree to be bound by the terms and provision of this agreement.
                If you do not agree to abide by the above, please do not use
                this service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="mb-4 text-2xl font-semibold text-gray-900">
                2. Description of Service
              </h2>
              <p className="leading-relaxed text-gray-600">
                MailPackr provides email services including campaign creation,
                list management, template design, and analytics. We reserve the
                right to modify or discontinue the service at any time without
                notice.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="mb-4 text-2xl font-semibold text-gray-900">
                3. User Responsibilities
              </h2>
              <p className="mb-4 leading-relaxed text-gray-600">
                You are responsible for:
              </p>
              <ul className="list-inside list-disc space-y-2 text-gray-600">
                <li>
                  Maintaining the confidentiality of your account information
                </li>
                <li>
                  Ensuring compliance with applicable laws and regulations
                </li>
                <li>
                  Not using the service for spam or unsolicited communications
                </li>
                <li>Obtaining proper consent from email recipients</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="mb-4 text-2xl font-semibold text-gray-900">
                4. Prohibited Uses
              </h2>
              <p className="mb-4 leading-relaxed text-gray-600">
                You may not use our service:
              </p>
              <ul className="list-inside list-disc space-y-2 text-gray-600">
                <li>
                  For any unlawful purpose or to solicit the performance of any
                  unlawful activity
                </li>
                <li>
                  To violate any international, federal, provincial, or state
                  regulations, rules, laws, or local ordinances
                </li>
                <li>
                  To transmit, or procure the sending of, any advertising or
                  promotional material, including spam
                </li>
                <li>
                  To impersonate or attempt to impersonate another person or
                  entity
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="mb-4 text-2xl font-semibold text-gray-900">
                5. Limitation of Liability
              </h2>
              <p className="leading-relaxed text-gray-600">
                MailPackr shall not be liable for any indirect, incidental,
                special, consequential, or punitive damages, including without
                limitation, loss of profits, data, use, goodwill, or other
                intangible losses.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="mb-4 text-2xl font-semibold text-gray-900">
                6. Contact Information
              </h2>
              <p className="leading-relaxed text-gray-600">
                If you have any questions about these Terms of Service, please
                contact us at:
                <br />
                <strong>Email:</strong> legal@mailpackr.com
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Users, BarChart3, Shield } from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="page-container min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 text-content">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Mail className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900">MailPackr</span>
          </div>
          <div className="flex items-center space-x-4">
            <Button asChild>
              <Link href="/auth">Sign In</Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="mb-6 text-5xl font-bold text-gray-900">
            Drive engagement with every send
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-xl text-gray-600">
            Create, send, and track beautiful email campaigns that convert.
            Build your audience and grow your business with MailPackr.
          </p>
          <div className="flex justify-center">
            <Button variant="outline" size="lg">
              Watch Demo
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="text-center">
              <Mail className="mx-auto mb-4 h-12 w-12 text-blue-600" />
              <CardTitle>Beautiful Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Create stunning emails with our drag-and-drop editor and
                professional templates.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <Users className="mx-auto mb-4 h-12 w-12 text-green-600" />
              <CardTitle>Audience Management</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Organize your contacts into targeted lists and segments for
                better engagement.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <BarChart3 className="mx-auto mb-4 h-12 w-12 text-purple-600" />
              <CardTitle>Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Track opens, clicks, and conversions with detailed analytics and
                reporting.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <Shield className="mx-auto mb-4 h-12 w-12 text-red-600" />
              <CardTitle>Deliverability</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Ensure your emails reach the inbox with our enterprise-grade
                infrastructure.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Pricing Section */}
        <div className="mt-24">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold text-gray-900">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-gray-600">
              Start free, scale as you grow
            </p>
          </div>

          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
            {/* Free Plan */}
            <Card className="border-2 border-blue-200 bg-blue-50/50">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold text-blue-600">
                  Free
                </CardTitle>
                <div className="mt-4 text-4xl font-bold text-gray-900">$0</div>
                <p className="text-gray-600">Forever free</p>
              </CardHeader>
              <CardContent>
                <ul className="mb-8 space-y-3">
                  <li className="flex items-center">
                    <svg
                      className="mr-3 h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    3,000 emails/month
                  </li>
                  <li className="flex items-center">
                    <svg
                      className="mr-3 h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Unlimited contacts
                  </li>
                  <li className="flex items-center">
                    <svg
                      className="mr-3 h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Email templates
                  </li>
                  <li className="flex items-center">
                    <svg
                      className="mr-3 h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Basic analytics
                  </li>
                </ul>
                <Button className="w-full" asChild>
                  <Link href="/auth">Start Free</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Business Plan */}
            <Card className="relative border-2 border-purple-200 bg-purple-50/50">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 transform rounded-full bg-purple-600 px-4 py-1 text-sm font-medium text-white">
                Most Popular
              </div>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold text-purple-600">
                  Business
                </CardTitle>
                <div className="mt-4 text-4xl font-bold text-gray-900">
                  $0.001
                </div>
                <p className="text-gray-600">per email sent</p>
              </CardHeader>
              <CardContent>
                <ul className="mb-8 space-y-3">
                  <li className="flex items-center">
                    <svg
                      className="mr-3 h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Unlimited emails/month
                  </li>
                  <li className="flex items-center">
                    <svg
                      className="mr-3 h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Unlimited contacts
                  </li>
                  <li className="flex items-center">
                    <svg
                      className="mr-3 h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Premium templates
                  </li>
                  <li className="flex items-center">
                    <svg
                      className="mr-3 h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Advanced analytics
                  </li>
                  <li className="flex items-center">
                    <svg
                      className="mr-3 h-5 w-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Pay-as-you-go model
                  </li>
                </ul>
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  asChild
                >
                  <Link href="/auth">Start Business</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto mt-16 border-t px-4 py-8">
        <div className="flex flex-col items-center justify-between md:flex-row">
          <div className="mb-4 flex items-center space-x-2 md:mb-0">
            <Mail className="h-6 w-6 text-blue-600" />
            <span className="text-lg font-semibold text-gray-900">
              MailPackr
            </span>
          </div>
          <div className="flex space-x-6 text-sm text-gray-600">
            <Link href="/terms" className="hover:text-gray-900">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-gray-900">
              Privacy Policy
            </Link>
            <a
              href="mailto:support@mailpackr.com"
              className="hover:text-gray-900"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
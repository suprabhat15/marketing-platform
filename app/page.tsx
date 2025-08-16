import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Users, BarChart3, Shield } from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Mail className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900">MailPackr</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/auth" className="text-gray-600 hover:text-gray-900">
              Sign In
            </Link>
            <Button asChild>
              <Link href="/auth">Get Started</Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Email Marketing Made Simple
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Create, send, and track beautiful email campaigns that convert. 
            Build your audience and grow your business with MailPackr.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link href="/auth">Start Free Trial</Link>
            </Button>
            <Button variant="outline" size="lg">
              Watch Demo
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <Card>
            <CardHeader className="text-center">
              <Mail className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <CardTitle>Beautiful Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Create stunning emails with our drag-and-drop editor and professional templates.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <Users className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <CardTitle>Audience Management</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Organize your contacts into targeted lists and segments for better engagement.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <BarChart3 className="h-12 w-12 text-purple-600 mx-auto mb-4" />
              <CardTitle>Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Track opens, clicks, and conversions with detailed analytics and reporting.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <Shield className="h-12 w-12 text-red-600 mx-auto mb-4" />
              <CardTitle>Deliverability</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Ensure your emails reach the inbox with our enterprise-grade infrastructure.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="mt-24 text-center bg-white rounded-2xl p-12 shadow-lg">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to grow your business?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Join thousands of businesses using MailPackr to connect with their customers.
          </p>
          <Button size="lg" asChild>
            <Link href="/auth">Get Started Today</Link>
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 mt-16 border-t">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
            <Mail className="h-6 w-6 text-blue-600" />
            <span className="text-lg font-semibold text-gray-900">MailPackr</span>
          </div>
          <div className="flex space-x-6 text-sm text-gray-600">
            <Link href="/terms" className="hover:text-gray-900">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-gray-900">
              Privacy Policy
            </Link>
            <a href="mailto:support@mailpackr.com" className="hover:text-gray-900">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
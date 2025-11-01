"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Send, Clock, Users } from "lucide-react";
import SendNowFlyout from '@/components/campaigns/send-now-flyout';

interface Template {
  id: string;
  name: string;
  subject: string;
  content: string;
}

interface List {
  id: string;
  name: string;
  description: string;
  _count: {
    subscribers: number;
  };
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [showSendNowFlyout, setShowSendNowFlyout] = useState(false);

  // Form state
  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedList, setSelectedList] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  useEffect(() => {
    fetchTemplates();
    fetchLists();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchLists = async () => {
    try {
      const response = await fetch('/api/lists');
      if (response.ok) {
        const data = await response.json();
        setLists(data.lists || []);
      }
    } catch (error) {
      console.error('Error fetching lists:', error);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setContent(template.content);
    }
  };

  const handleSendNowClick = () => {
    if (!campaignName || !subject || !content || !selectedList) {
      alert('Please fill in all required fields');
      return;
    }

    setShowSendNowFlyout(true);
  };

  const handleSendNow = async (senderConfig: {
    fromEmail: string;
    fromName: string;
    replyTo: string;
    domain: string;
  }) => {
    setIsLoading(true);

    try {
      // Fetch subscribers for the selected list
      const subscribersResponse = await fetch(
        `/api/lists/${selectedList}/subscribers`
      );
      if (!subscribersResponse.ok) {
        throw new Error('Failed to fetch subscribers');
      }

      const subscribersData = await subscribersResponse.json();
      const subscriberIds = subscribersData.subscribers.map((s: any) => s.id);

      const campaignData = {
        name: campaignName,
        subject,
        content,
        listId: selectedList,
        templateId: selectedTemplate || undefined,
        subscriberIds: subscriberIds,
        fromEmail: senderConfig.fromEmail,
        fromName: senderConfig.fromName,
        replyTo: senderConfig.replyTo,
      };

      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignData),
      });

      if (response.ok) {
        const result = await response.json();

        // Send campaign immediately
        await fetch(`/api/campaigns/${result.campaign.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        router.push('/campaigns');
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error creating campaign:', error);
      alert('An error occurred while creating the campaign');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCampaign = async (sendNow: boolean = false) => {
    if (!campaignName || !subject || !content || !selectedList) {
      alert('Please fill in all required fields');
      return;
    }

    setIsLoading(true);

    try {
      const campaignData = {
        name: campaignName,
        subject,
        content,
        listId: selectedList,
        templateId: selectedTemplate || undefined,
        scheduledAt: sendNow ? undefined : `${scheduleDate}T${scheduleTime}`,
        subscriberIds: [], // Empty for drafts - will be populated when sending
        fromEmail: 'placeholder@example.com', // Placeholder for drafts
        fromName: 'Draft Campaign',
        replyTo: '',
      };

      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignData),
      });

      if (response.ok) {
        const result = await response.json();

        if (sendNow) {
          // Send campaign immediately
          await fetch(`/api/campaigns/${result.campaign.id}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
        }

        router.push('/campaigns');
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error creating campaign:', error);
      alert('An error occurred while creating the campaign');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-3xl font-bold">Create New Campaign</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Campaign Details */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="campaign-name">Campaign Name *</Label>
              <Input
                id="campaign-name"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Enter campaign name"
              />
            </div>

            <div>
              <Label htmlFor="template-select">Email Template</Label>
              <Select
                value={selectedTemplate}
                onValueChange={handleTemplateSelect}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="subject">Subject Line *</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject"
              />
            </div>

            <div>
              <Label htmlFor="content">Email Content *</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter email content"
                rows={8}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="schedule-date">Schedule Date</Label>
                <Input
                  id="schedule-date"
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label htmlFor="schedule-time">Schedule Time</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recipients */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Select Recipients
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="list-select">Subscriber List *</Label>
              <Select value={selectedList} onValueChange={setSelectedList}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a subscriber list" />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name} ({list._count.subscribers} subscribers)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedList && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> All active subscribers from the
                  selected list will be included when you send the campaign.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-4">
        <Button
          variant="outline"
          onClick={() => handleCreateCampaign(false)}
          disabled={isLoading}
        >
          <Clock className="mr-2 h-4 w-4" />
          {scheduleDate && scheduleTime ? 'Schedule Campaign' : 'Save as Draft'}
        </Button>
        <Button onClick={handleSendNowClick} disabled={isLoading}>
          <Send className="mr-2 h-4 w-4" />
          {isLoading ? 'Sending...' : 'Send Now'}
        </Button>
      </div>

      <SendNowFlyout
        open={showSendNowFlyout}
        onClose={() => setShowSendNowFlyout(false)}
        onSend={handleSendNow}
      />
    </div>
  );
}
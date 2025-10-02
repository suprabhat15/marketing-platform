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

interface Subscriber {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [selectedSubscribers, setSelectedSubscribers] = useState<string[]>([]);

  // Form state
  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedList, setSelectedList] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [showSendNowFlyout, setShowSendNowFlyout] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchLists();
  }, []);

  useEffect(() => {
    if (selectedList) {
      fetchSubscribers(selectedList);
    }
  }, [selectedList]);

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

  const fetchSubscribers = async (listId: string) => {
    try {
      const response = await fetch(`/api/lists/${listId}/subscribers`);
      if (response.ok) {
        const data = await response.json();
        setSubscribers(data.subscribers || []);
      }
    } catch (error) {
      console.error('Error fetching subscribers:', error);
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

  const handleSubscriberToggle = (subscriberId: string) => {
    setSelectedSubscribers(prev => 
      prev.includes(subscriberId)
        ? prev.filter(id => id !== subscriberId)
        : [...prev, subscriberId]
    );
  };

  const handleSelectAllSubscribers = () => {
    if (selectedSubscribers.length === subscribers.length) {
      setSelectedSubscribers([]);
    } else {
      setSelectedSubscribers(subscribers.map((s) => s.id));
    }
  };

  const handleSendNowClick = () => {
    if (!campaignName || !subject || !content || !selectedList) {
      alert('Please fill in all required fields');
      return;
    }

    if (selectedSubscribers.length === 0) {
      alert('Please select at least one subscriber');
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
      const campaignData = {
        name: campaignName,
        subject,
        content,
        listId: selectedList,
        templateId: selectedTemplate || undefined,
        subscriberIds: selectedSubscribers,
        fromEmail: senderConfig.fromEmail,
        fromName: senderConfig.fromName,
        replyTo: senderConfig.replyTo,
      };
      console.log('senderConfig ', senderConfig);
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

    if (selectedSubscribers.length === 0) {
      alert('Please select at least one subscriber');
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
        subscriberIds: selectedSubscribers,
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

            {subscribers.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <Label>
                    Choose Subscribers ({selectedSubscribers.length} selected)
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllSubscribers}
                  >
                    {selectedSubscribers.length === subscribers.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </Button>
                </div>

                <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-3">
                  {subscribers.map((subscriber) => (
                    <div
                      key={subscriber.id}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={subscriber.id}
                        checked={selectedSubscribers.includes(subscriber.id)}
                        onCheckedChange={() =>
                          handleSubscriberToggle(subscriber.id)
                        }
                      />
                      <Label
                        htmlFor={subscriber.id}
                        className="flex-1 cursor-pointer"
                      >
                        {subscriber.firstName} {subscriber.lastName} (
                        {subscriber.email})
                      </Label>
                    </div>
                  ))}
                </div>
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
          {/* <Button onClick={() => handleCreateCampaign(true)} disabled={isLoading}> */}
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
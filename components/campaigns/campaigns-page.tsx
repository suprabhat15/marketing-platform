// "use client";

// import { useState } from "react";
// import { CampaignList } from "./campaign-list";
// import { Button } from "@/components/ui/button";
// import { Plus } from "lucide-react";

// // Mock data for campaigns
// const mockCampaigns = [
//   {
//     id: "1",
//     name: "Welcome Series Campaign",
//     subject: "Welcome to our newsletter!",
//     status: "SENT" as const,
//     recipientCount: 1250,
//     scheduledAt: null,
//     sentAt: "2024-01-15T10:30:00Z",
//     createdAt: "2024-01-14T15:00:00Z",
//   },
//   {
//     id: "2",
//     name: "Product Launch Announcement",
//     subject: "Introducing our new product line",
//     status: "DRAFT" as const,
//     recipientCount: 850,
//     scheduledAt: null,
//     sentAt: null,
//     createdAt: "2024-01-16T09:15:00Z",
//   },
//   {
//     id: "3",
//     name: "Holiday Promotion",
//     subject: "Special holiday discounts inside!",
//     status: "SCHEDULED" as const,
//     recipientCount: 2100,
//     scheduledAt: "2024-01-20T12:00:00Z",
//     sentAt: null,
//     createdAt: "2024-01-17T14:20:00Z",
//   },
// ];

// export function CampaignsPage() {
//   const [campaigns, setCampaigns] = useState(mockCampaigns);

//   const handleSendCampaign = (campaignId: string, scheduleAt?: Date) => {
//     setCampaigns(prev =>
//       prev.map(campaign =>
//         campaign.id === campaignId
//           ? {
//               ...campaign,
//               status: scheduleAt ? "SCHEDULED" as const : "SENDING" as const,
//               scheduledAt: scheduleAt?.toISOString() || null,
//             }
//           : campaign
//       )
//     );
//   };

//   const handleRefresh = () => {
//     // In a real app, this would refetch campaigns from the API
//     console.log("Refreshing campaigns...");
//   };

//   const handleCreateCampaign = () => {
//     // In a real app, this would navigate to campaign creation page
//     console.log("Creating new campaign...");
//   };

//   return (
//     <div className="space-y-6">
//       <div className="flex items-center justify-between">
//         <div>
//           <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
//           <p className="text-gray-600 mt-1">
//             Create and manage your email campaigns
//           </p>
//         </div>
//         <Button onClick={handleCreateCampaign} className="flex items-center gap-2">
//           <Plus className="h-4 w-4" />
//           Create Campaign
//         </Button>
//       </div>

//       <CampaignList
//         campaigns={campaigns}
//         onSendCampaign={handleSendCampaign}
//         onRefresh={handleRefresh}
//       />
//     </div>
//   );
// }
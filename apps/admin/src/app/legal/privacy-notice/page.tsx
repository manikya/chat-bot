import { LegalDocument } from "@/components/legal/legal-document";

export default function PrivacyNoticePage() {
  return (
    <LegalDocument
      title="Privacy Notice"
      description="This notice summarizes how information may be handled in CommerceChat-powered chat experiences."
      sections={[
        {
          heading: "Information We Process",
          body:
            "Chat messages, page context, product interactions, cart actions, and technical metadata may be processed to provide the chatbot experience.",
        },
        {
          heading: "How Information Is Used",
          body:
            "Information may be used to respond to messages, recommend products, support checkout, notify store teams, maintain safety, troubleshoot issues, and improve the service.",
        },
        {
          heading: "Store And Service Providers",
          body:
            "The store using CommerceChat may receive and manage conversation information. Some processing may be handled by infrastructure, AI, analytics, messaging, or commerce service providers.",
        },
        {
          heading: "Sensitive Information",
          body:
            "Do not submit passwords, payment card numbers, government IDs, health information, or other sensitive details through chat unless the store explicitly asks for them through a secure flow.",
        },
      ]}
    />
  );
}

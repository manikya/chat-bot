import { LegalDocument } from "@/components/legal/legal-document";

export default function AcceptableUsePage() {
  return (
    <LegalDocument
      title="Acceptable Use Policy"
      description="This policy explains what is not allowed when using a CommerceChat-powered chatbot."
      sections={[
        {
          heading: "Prohibited Content",
          body:
            "Do not use the chatbot to create, request, or distribute illegal, abusive, hateful, deceptive, sexually exploitative, or harmful content.",
        },
        {
          heading: "Security And Abuse",
          body:
            "Do not attempt to bypass safeguards, extract system prompts, overload the service, scrape data, or interfere with another tenant, store, or shopper experience.",
        },
        {
          heading: "Commerce Integrity",
          body:
            "Do not use the chatbot to misrepresent products, prices, availability, policies, identity, or payment instructions.",
        },
      ]}
    />
  );
}

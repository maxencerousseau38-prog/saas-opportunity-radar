// Deterministic categorisation of collected catalog listings (first bulk
// collection, 10 November 2026). A listing's source classes (e.g. Wikidata
// "instance of" labels) are matched first, then its own description; the
// first matching rules give up to three category slugs, the first one being
// the primary category. No match leaves the product uncategorised (unknown),
// never guessed. Versioned: a change of rules is a new version.
export const CATEGORY_MAPPING_VERSION = "catmap-1";

interface CategoryRule {
  slug: string;
  pattern: RegExp;
}

// Ordered from the most specific to the most generic. Slugs are those of the
// taxonomy (reference data + migration 20261116090000_catalog_sources).
const RULES: CategoryRule[] = [
  // Sales & CRM
  { slug: "sales-crm-crm", pattern: /\b(crm|customer relationship management)\b/i },
  { slug: "sales-crm-sales-engagement", pattern: /\bsales engagement\b/i },
  {
    slug: "sales-crm-sales-automation",
    pattern: /\b(sales automation|sales software|sales force automation)\b/i,
  },
  { slug: "sales-crm-sales-intelligence", pattern: /\bsales intelligence\b/i },
  // Marketing & Growth
  {
    slug: "marketing-growth-email-marketing",
    pattern: /\b(email marketing|e-mail marketing|newsletter|mailing list)\b/i,
  },
  { slug: "marketing-growth-marketing-automation", pattern: /\bmarketing automation\b/i },
  {
    slug: "marketing-growth-social-media-management",
    pattern: /\bsocial media (management|marketing|scheduling)\b/i,
  },
  { slug: "marketing-growth-seo", pattern: /\b(search engine optimi[sz]ation|seo)\b/i },
  {
    slug: "marketing-growth-advertising-management",
    pattern: /\b(advertising|ad server|ad network|ad management)\b/i,
  },
  {
    slug: "marketing-growth-marketing-analytics",
    pattern: /\b(web analytics|marketing analytics|website analytics)\b/i,
  },
  { slug: "marketing-growth-content-marketing", pattern: /\bcontent marketing\b/i },
  { slug: "marketing-growth-lead-generation", pattern: /\blead generation\b/i },
  {
    slug: "marketing-growth-campaign-management",
    pattern:
      /\b(campaign management|marketing (software|tools?|platforms?)|internet marketing|online marketing|digital marketing|reputation management)\b/i,
  },
  // Data & Analytics
  { slug: "data-analytics-business-intelligence", pattern: /\bbusiness intelligence\b/i },
  { slug: "data-analytics-data-visualization", pattern: /\bdata visuali[sz]ation\b/i },
  {
    slug: "data-analytics-data-integration",
    pattern: /\b(data integration|etl|extract, transform, load|data pipeline)\b/i,
  },
  { slug: "data-analytics-dashboarding", pattern: /\bdashboards?\b/i },
  { slug: "data-analytics-reporting", pattern: /\breporting\b/i },
  {
    slug: "data-analytics-data-analytics",
    pattern: /\b(analytics|data analysis|statistic(s|al software)|data science)\b/i,
  },
  // Automation & AI
  { slug: "automation-ai-ai-agents", pattern: /\b(ai agents?|autonomous agents?)\b/i },
  {
    slug: "automation-ai-ai-productivity",
    pattern:
      /\b(chatbots?|artificial intelligence|large language models?|generative ai|ai assistants?|virtual assistants?|machine learning|machine translation|speech recognition)\b/i,
  },
  {
    slug: "automation-ai-workflow-automation",
    pattern:
      /\b(workflow automation|workflow|integration platform|ipaas|business process automation|robotic process automation)\b/i,
  },
  // Business Operations
  {
    slug: "business-operations-project-management",
    pattern:
      /\b(project management|task management|issue track(er|ing)|bug track(er|ing)|kanban|time tracking)\b/i,
  },
  {
    slug: "business-operations-finance-operations",
    pattern:
      /\b(accounting|invoic(e|ing)|expense management|billing|payment (service|processing|platform)|bookkeeping|financial software)\b/i,
  },
  {
    slug: "business-operations-customer-support",
    pattern: /\b(help ?desk|customer (support|service)|ticketing|live chat)\b/i,
  },
  {
    slug: "business-operations-document-automation",
    pattern:
      /\b(electronic signature|e-signature|digital signature|document management|form builder|online forms?|pdf)\b/i,
  },
  {
    slug: "business-operations-business-management",
    pattern: /\b(enterprise resource planning|erp|business management|business software)\b/i,
  },
  // E-commerce
  { slug: "ecommerce-inventory-management", pattern: /\binventory management\b/i },
  {
    slug: "ecommerce-store-management",
    pattern:
      /\b(e-?commerce|online stores?|shopping cart|online shops?|online shopping|online marketplaces?|marketplaces?)\b/i,
  },
  // HR & Recruiting
  { slug: "hr-recruiting-payroll", pattern: /\bpayroll\b/i },
  {
    slug: "hr-recruiting-recruiting",
    pattern: /\b(recruit(ing|ment)|applicant tracking|job board|hiring)\b/i,
  },
  {
    slug: "hr-recruiting-hr-management",
    pattern:
      /\b(human resources?|hr software|hris|human capital|employee (management|engagement))\b/i,
  },
  // Education
  { slug: "education-learning-learning-management", pattern: /\b(learning management|lms)\b/i },
  {
    slug: "education-learning-online-learning",
    pattern:
      /\b(e-?learning|online (learning|courses?|education)|educational (software|technology)|education|mooc|language learning|tutoring|student information)\b/i,
  },
  // Security & IT
  { slug: "security-it-password-management", pattern: /\bpassword manag(er|ement)\b/i },
  {
    slug: "security-it-identity-access",
    pattern:
      /\b(identity management|identity and access|single sign-on|sso|authentication|access management)\b/i,
  },
  {
    slug: "security-it-backup-storage",
    pattern: /\b(online backup|backup|cloud storage|file hosting|file synchroni[sz]ation)\b/i,
  },
  {
    slug: "security-it-it-management",
    pattern:
      /\b(it service management|remote (desktop|access|support)|endpoint|device management|mobile device management|antivirus|computer security|cybersecurity|vpn|firewall|systems management|system administration|administration tools?|network management|configuration management)\b/i,
  },
  // Communication & Collaboration
  {
    slug: "communication-collaboration-video-conferencing",
    pattern: /\b(video ?conferencing|web conferencing|videotelephony|online meetings?)\b/i,
  },
  {
    slug: "communication-collaboration-messaging",
    pattern:
      /\b(instant messaging|team chat|messaging (apps?|services?|software|platforms?)|business messaging|voip|voice over ip|telephony|telecommunications? service|sms|call cent(er|re)|chat service)\b/i,
  },
  {
    slug: "communication-collaboration-email-calendar",
    pattern: /\b(webmail|e-?mail (clients?|services?|hosting)|calendaring)\b/i,
  },
  {
    slug: "communication-collaboration-collaboration",
    pattern: /\b(collaborative software|collaboration|wiki software|intranet|groupware)\b/i,
  },
  // Productivity
  {
    slug: "productivity-note-taking",
    pattern:
      /\b(note-?taking|notebooks?|personal knowledge|reference manag(er|ement)|bookmarking)\b/i,
  },
  {
    slug: "productivity-forms-surveys",
    pattern: /\b(surveys?|questionnaires?|polls?|polling|form builders?|online forms?)\b/i,
  },
  { slug: "productivity-scheduling", pattern: /\b(scheduling|appointment|booking|calendar)\b/i },
  {
    slug: "productivity-office-suites",
    pattern:
      /\b(office suites?|office software|spreadsheets?|word processors?|presentation software|productivity software)\b/i,
  },
  {
    slug: "productivity-file-sharing",
    pattern:
      /\b(file sharing|file transfer|photo sharing|image hosting|media hosting|video sharing)\b/i,
  },
  // Design & Creative
  {
    slug: "design-creative-prototyping",
    pattern: /\b(prototyping|wireframing|user interface design|ui design|ux design)\b/i,
  },
  {
    slug: "design-creative-graphic-design",
    pattern:
      /\b(graphic design|image editing|photo editing|raster graphics|vector graphics|illustration software|diagram)\b/i,
  },
  {
    slug: "design-creative-video-audio",
    pattern:
      /\b(video editing|video hosting|audio editing|podcasts?|screen recording|music|streaming media|video on demand|audio)\b/i,
  },
  {
    slug: "design-creative-website-builders",
    pattern:
      /\b(website builders?|content management systems?|cms|web publishing|publishing platforms?|blogging (platforms?|software)|landing pages?)\b/i,
  },
  // Industry & Vertical Software
  {
    slug: "vertical-software-maps-location",
    pattern:
      /\b(web mapping|web maps?|internet map|maps?|navigation|geographic information|gis|geolocation)\b/i,
  },
  {
    slug: "vertical-software-healthcare",
    pattern:
      /\b(medical|health ?care|health records?|personal health|telemedicine|telehealth|electronic health|clinical|pharmacy|fitness|wellness)\b/i,
  },
  {
    slug: "vertical-software-legal",
    pattern: /\b(legal|law firms?|e-?discovery|contract management|compliance)\b/i,
  },
  {
    slug: "vertical-software-government-civic",
    pattern:
      /\b(e-?government|government|voting advice|civic|public administration|electronic legal)\b/i,
  },
  {
    slug: "vertical-software-travel-hospitality",
    pattern:
      /\b(travel|hotel|hospitality|restaurant|flight|tourism|ride-?hailing|food delivery)\b/i,
  },
  { slug: "vertical-software-real-estate", pattern: /\b(real estate|property management)\b/i },
  // Generic one-word categories of launch directories (e.g. Uneed), last resort.
  { slug: "automation-ai-ai-productivity", pattern: /\b(ai|gpt|llm)\b/i },
  { slug: "marketing-growth-campaign-management", pattern: /\bmarketing\b/i },
  { slug: "sales-crm-sales-automation", pattern: /\bsales\b/i },
  { slug: "business-operations-finance-operations", pattern: /\b(finance|fintech|payments?)\b/i },
  { slug: "design-creative-graphic-design", pattern: /\bdesign\b/i },
  { slug: "productivity-note-taking", pattern: /\b(productivity|personal life)\b/i },
  // Developer Tools (kept after the business categories: lower priority, PRD §4.2.E)
  {
    slug: "developer-tools-monitoring",
    pattern: /\b(monitoring|observability|uptime|application performance|log management)\b/i,
  },
  {
    slug: "developer-tools-api-platforms",
    pattern: /\b(api management|api platform|application programming interface|web api)\b/i,
  },
  {
    slug: "developer-tools-developer-productivity",
    pattern:
      /\b(developer tools?|development|version control|continuous integration|continuous delivery|integrated development environment|ide|code review|source code|repository hosting|software development|devops|low-code|no-code|forge|(html|text|code|rich-text) editor|web framework|software framework|javascript library|software testing|testing tools?|api testing|build automation|compiler)\b/i,
  },
  {
    slug: "developer-tools-infrastructure",
    pattern:
      /\b(cloud computing|web hosting|hosting services?|platform as a service|paas|infrastructure as a service|iaas|databases?|database management|content delivery network|cdn|serverless|cloud platform|message queu(e|ing)|server software|software repository|package manag(er|ement)|object storage)\b/i,
  },
];

export interface CategorizableListing {
  name: string;
  description: string | null;
  sourceCategories: string[];
}

/** Up to `max` category slugs, primary first; empty when nothing matches. */
export function categorizeListing(listing: CategorizableListing, max = 3): string[] {
  const out: string[] = [];
  const texts = [listing.sourceCategories.join(" | "), listing.description ?? ""];
  for (const text of texts) {
    if (!text) continue;
    for (const rule of RULES) {
      if (out.length >= max) return out;
      if (!out.includes(rule.slug) && rule.pattern.test(text)) out.push(rule.slug);
    }
  }
  return out;
}

/** Every slug the rules can produce (the ingestion integration test checks they exist). */
export const CATEGORY_MAPPING_SLUGS = [...new Set(RULES.map((r) => r.slug))];

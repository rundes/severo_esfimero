# Product

## Register

product

## Users

Grassroots field volunteers (*relevadores*) of mixed ages and tech comfort, canvassing door to door on their own phones. Design for the lowest tech-comfort volunteer, not the power user. Their context is the worst case for software: outdoors in direct sun, standing at a stranger's door, one hand on the phone, the citizen waiting, connectivity unreliable. A relevamiento is a short, interruptible interaction that must not feel like filling out a form. The volunteer is also the project's face at the door, so the tool's credibility reflects on them.

## Product Purpose

Proyecto Severo — Relevamientos is the territorial citizen-survey system for Proyecto Severo in Maipú, Provincia de Buenos Aires. Volunteers locate a citizen in the integrated electoral roll (*padrón integrado*) and record a relevamiento against them: civic *problemáticas*, socio-housing conditions (with a photo of the home's front), and electoral participation. It is a mobile-first installable PWA backed by Google Sheets, Cloud Storage, and Google sign-in, built to keep working when the network does not.

Success: a volunteer reaches a household, finds the right person, and captures an accurate relevamiento in under a minute, without losing data and without the interaction feeling intrusive. Coverage compounds from there: many volunteers, many doors, clean data flowing into the dashboards (*severo_data*).

## Brand Personality

Confident, modern, capable. The interface should read as a well-run, technically solid operation, not a hobby project and not a government legacy system. Voice is plain Rioplatense Spanish (voseo), direct and respectful. Calm under pressure: errors are recoverable and clearly explained, never alarming. The tool earns trust by being obviously competent, not by decorating itself.

## Anti-references

- **Clunky government portal** (primary): the dated, bureaucratic municipal / `argentina.gob.ar` aesthetic. Gray dense forms, lifeless type, institutional coldness. The single strongest thing to avoid.
- Flashy startup SaaS: gradient heroes, emoji confetti, marketing-app energy. Too slick and unserious for field work.
- Cluttered enterprise CRM (Salesforce-style): too many fields, tabs, and chrome competing on one screen.
- Surveillance / police tool: a cold, intimidating data-harvesting look that would alarm a citizen standing at their own door.

## Design Principles

- **Speed at the door.** The door interaction is short and interruptible. Minimize taps to find a citizen and capture a relevamiento. Every extra field, confirmation, or screen is a cost paid in front of a waiting stranger.
- **Trust through legibility, not chrome.** Confident and modern means clear, not decorated. Hierarchy and contrast do the work; ornament is suspect. The tool looks competent because information is easy to read, not because it is styled.
- **Never lose the volunteer's work.** Field connectivity fails mid-survey. Guard unsaved data, make save errors recoverable with an explicit retry, and never drop a relevamiento silently. The existing confirm-on-abandon and retry-on-save behavior is the baseline, not the exception.
- **Field-first ergonomics.** Built for one hand in direct sunlight: high contrast for glare, generous touch targets (32px+), thumb-reachable primary actions, portrait-only. Outdoor readability outranks visual density.
- **Dignified, not surveillant.** This handles sensitive citizen data (roll, address, social-welfare flags, deceased status). The interface must feel legitimate and humane to the person at the door and treat their data with visible care, never like harvesting.

## Accessibility & Inclusion

Outdoor legibility is the first-order requirement: high contrast tuned for direct sun glare, large touch targets (32px minimum, already adopted for the delete-photo control), and one-handed thumb reach in portrait. Treat strong contrast and target sizing as non-negotiable; standard focus states and `prefers-reduced-motion` support are a welcome baseline on top. Mixed-tech-comfort volunteers mean labels and errors must be plain-language and unambiguous, never relying on iconography alone.

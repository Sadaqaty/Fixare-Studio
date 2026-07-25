/**
 * Enhanced Social Proof Engine
 * Dynamic, location-aware, time-sensitive social proof notifications
 */

const CITIES = [
    'London', 'New York', 'Tokyo', 'Berlin', 'Paris', 'Sydney', 'Toronto',
    'Dubai', 'Singapore', 'Amsterdam', 'San Francisco', 'Seoul', 'Mumbai',
    'Barcelona', 'Stockholm', 'Zurich', 'Lisbon', 'Melbourne', 'Chicago',
    'Hong Kong', 'Bangkok', 'Istanbul', 'Sao Paulo', 'Cape Town', 'Nairobi'
];

const COUNTRIES = [
    'United Kingdom', 'United States', 'Japan', 'Germany', 'France',
    'Australia', 'Canada', 'UAE', 'Singapore', 'Netherlands',
    'USA', 'South Korea', 'India', 'Spain', 'Sweden'
];

const ACTIONS = [
    { verb: 'viewed', pages: ['the homepage', 'the Careers page', 'the services section', 'the portfolio'] },
    { verb: 'joined', pages: ['the Galactic Port', 'the platform', 'the community'] },
    { verb: 'applied for', pages: ['the Creative Designer role', 'the Frontend Developer position', 'a role at Fixare Studio'] },
    { verb: 'submitted a proposal on', pages: ['the contact form', 'the inquiry form'] },
    { verb: 'downloaded', pages: ['the brochure', 'the case study', 'the product sheet'] }
];

const PROMO_EVENTS = [
    { code: 'GALAXY20', discount: '20%' },
    { code: 'FIXARE10', discount: '10%' },
    { code: 'LAUNCH50', discount: '50%' },
    { code: 'WELCOME15', discount: '15%' }
];

const URGENCY_MESSAGES = [
    'Only {count} spots remaining for this month!',
    '{count} teams already signed up this week.',
    'Limited availability — {count} slots left.',
    'Over {count} companies trust us.',
    '{count} projects delivered this quarter.'
];

export class SocialProofEngine {
    constructor(config, ui) {
        this.config = config;
        this.ui = ui;
        this._timer = null;
        this._messageIndex = 0;
        this._visitorBase = this._getVisitorBase();
    }

    _getVisitorBase() {
        const hour = new Date().getHours();
        if (hour >= 9 && hour <= 17) return 15 + Math.floor(Math.random() * 10);
        if (hour >= 17 && hour <= 22) return 8 + Math.floor(Math.random() * 6);
        return 3 + Math.floor(Math.random() * 4);
    }

    _randomCity() {
        return CITIES[Math.floor(Math.random() * CITIES.length)];
    }

    _randomAction() {
        return ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
    }

    _generateMessage() {
        const type = Math.random();

        // 35% - Location-based activity
        if (type < 0.35) {
            const action = this._randomAction();
            const city = this._randomCity();
            return `Someone from ${city} just ${action.verb} ${action.pages[Math.floor(Math.random() * action.pages.length)]}.`;
        }

        // 25% - Promo code usage
        if (type < 0.60) {
            const promo = PROMO_EVENTS[Math.floor(Math.random() * PROMO_EVENTS.length)];
            return `Someone just used promo code ${promo.code} for ${promo.discount} off.`;
        }

        // 20% - View count / trending
        if (type < 0.80) {
            const count = this._visitorBase + Math.floor(Math.random() * 20);
            return `${count} people are currently viewing this page.`;
        }

        // 15% - Urgency / scarcity
        if (type < 0.95) {
            const template = URGENCY_MESSAGES[Math.floor(Math.random() * URGENCY_MESSAGES.length)];
            const count = 3 + Math.floor(Math.random() * 12);
            return template.replace('{count}', count);
        }

        // 5% - Social proof milestone
        const milestones = [
            'Trusted by 100+ companies worldwide.',
            'Featured on Product Hunt this week.',
            'Award-winning design studio.',
            'Join 500+ satisfied clients.',
            'Over 1M users served globally.'
        ];
        return milestones[Math.floor(Math.random() * milestones.length)];
    }

    start() {
        const showRandom = () => {
            // 30% chance every 90 seconds
            if (Math.random() > 0.70) {
                const message = this._generateMessage();
                this.ui.showSocialProof(message);

                // Track the event
                this.tracker?.trackAction('Social Proof', message);
            }
        };

        // Show first message after 15-45 seconds
        const initialDelay = 15000 + Math.random() * 30000;
        setTimeout(() => {
            showRandom();
            // Then every 90 seconds
            this._timer = setInterval(showRandom, 90000);
        }, initialDelay);
    }

    stop() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }
}

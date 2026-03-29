/**
 * Database Registry — Complete mapping of all AGENT ZERO databases.
 *
 * 50 databases across 11 categories. Each entry has:
 * - keywords: for intent matching + cache indexing (Arabic + English + French)
 * - emoji: visual identifier
 * - category: group name
 * - purpose: what it does (for onboarding/help)
 * - workflowHint: key fields for guided creation
 * - naturalTriggers: phrases that should route to this database
 */

const CATEGORIES = {
  sales: { emoji: '💰', name: 'المبيعات والعملاء', nameEn: 'Sales & Clients' },
  operations: { emoji: '📦', name: 'التشغيل', nameEn: 'Operations' },
  growth: { emoji: '📈', name: 'النمو والإدارة', nameEn: 'Growth & Management' },
  marketing: { emoji: '📢', name: 'التسويق والمحتوى', nameEn: 'Marketing & Content' },
  team: { emoji: '🤝', name: 'الشراكات والفريق', nameEn: 'Partnerships & Team' },
  events: { emoji: '🎪', name: 'الفعاليات والـ Agents', nameEn: 'Events & Agents' },
  experiments: { emoji: '🧪', name: 'التجارب', nameEn: 'Experiments' },
  security: { emoji: '🔐', name: 'الحماية والقرارات', nameEn: 'Protection & Decisions' },
  personal: { emoji: '🚀', name: 'النمو الشخصي', nameEn: 'Personal Growth' },
  productivity: { emoji: '⏱️', name: 'الإنتاجية', nameEn: 'Productivity' },
  tools: { emoji: '🛠️', name: 'الأدوات', nameEn: 'Tools & Relations' },
};

const DATABASE_MAP = [
  // =============== 💰 Sales & Clients ===============
  {
    keywords: ['عملاء', 'crm', 'client', 'clients', 'customer', 'customers', 'عميل', 'زبون', 'زبائن'],
    emoji: '👥', category: 'sales',
    purpose: 'Manage clients from first contact to last receipt — كل عميل من أول رسالة لآخر وصل',
    naturalTriggers: ['add client', 'new client', 'add customer', 'ضيف عميل', 'عميل جديد', 'زبون جديد'],
    workflowHint: { type: 'title_first', keyFields: ['phone', 'email', 'source', 'city', 'priority'] },
  },
  {
    keywords: ['leads', 'lead', 'فرص', 'ليد', 'ليدز', 'prospect', 'فرصة'],
    emoji: '🎯', category: 'sales',
    purpose: 'Track leads from first message to first payment — من أول رسالة لأول دفعة',
    naturalTriggers: ['add lead', 'new lead', 'ضيف ليد', 'فرصة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['source', 'value', 'pipeline', 'priority'] },
  },
  {
    keywords: ['مبيعات', 'فواتير', 'invoice', 'sale', 'sales', 'فاتورة', 'بيع'],
    emoji: '💰', category: 'sales',
    purpose: 'Every deal from offer to collection in DZD — كل صفقة من العرض للتحصيل',
    naturalTriggers: ['add invoice', 'new sale', 'فاتورة جديدة', 'بيع جديد'],
    workflowHint: { type: 'title_first', keyFields: ['amount', 'status', 'client'] },
  },
  {
    keywords: ['وصولات', 'إيصالات', 'receipt', 'receipts', 'وصل', 'إيصال'],
    emoji: '🧾', category: 'sales',
    purpose: 'Every payment documented and ready to send — كل وصل دفع موثق',
    naturalTriggers: ['add receipt', 'وصل جديد', 'إيصال جديد'],
    workflowHint: { type: 'title_first', keyFields: ['amount', 'client', 'method'] },
  },
  {
    keywords: ['مكالمات', 'متابعات', 'call', 'calls', 'follow-up', 'followup', 'مكالمة', 'متابعة'],
    emoji: '📞', category: 'sales',
    purpose: 'Call log and follow-up tracking — سجل المكالمات والمتابعات',
    naturalTriggers: ['log call', 'add call', 'سجّل مكالمة', 'متابعة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['client', 'type', 'status', 'notes'] },
  },
  {
    keywords: ['تقييمات', 'شهادات', 'review', 'reviews', 'testimonial', 'testimonials', 'تقييم', 'شهادة'],
    emoji: '⭐', category: 'sales',
    purpose: 'Client testimonials and reviews — تقييمات وشهادات العملاء',
    naturalTriggers: ['add review', 'add testimonial', 'تقييم جديد', 'شهادة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['client', 'rating', 'text'] },
  },
  {
    keywords: ['رسائل', 'قوالب', 'message', 'messages', 'template', 'templates', 'رسالة', 'قالب رسالة'],
    emoji: '💬', category: 'sales',
    purpose: 'Message templates for client communication — قوالب الرسائل',
    naturalTriggers: ['add template', 'new message template', 'قالب رسالة جديد'],
    workflowHint: { type: 'title_first', keyFields: ['category', 'body', 'platform'] },
  },

  // =============== 📦 Operations ===============
  {
    keywords: ['متجر', 'منتجات', 'product', 'products', 'store', 'منتج', 'سلعة'],
    emoji: '📦', category: 'operations',
    purpose: 'Full inventory with auto profit calculation — مخزون كامل مع حساب الأرباح',
    naturalTriggers: ['add product', 'new product', 'منتج جديد', 'سلعة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['price', 'cost', 'stock', 'category'] },
  },
  {
    keywords: ['موردين', 'مزودين', 'supplier', 'suppliers', 'vendor', 'مورد'],
    emoji: '🤝', category: 'operations',
    purpose: 'Know who delivers and who disappoints — الموردين والمزودين',
    naturalTriggers: ['add supplier', 'new vendor', 'مورد جديد'],
    workflowHint: { type: 'title_first', keyFields: ['contact', 'products', 'rating'] },
  },
  {
    keywords: ['مواعيد', 'حجوزات', 'appointment', 'appointments', 'booking', 'موعد', 'حجز'],
    emoji: '📅', category: 'operations',
    purpose: 'Never miss an appointment — المواعيد والحجوزات',
    naturalTriggers: ['add appointment', 'new booking', 'موعد جديد', 'حجز جديد'],
    workflowHint: { type: 'title_first', keyFields: ['date', 'client', 'type', 'status'] },
  },
  {
    keywords: ['شحنات', 'shipping', 'shipment', 'delivery', 'شحنة', 'توصيل', 'yalidine', 'zaki'],
    emoji: '🚚', category: 'operations',
    purpose: 'Track shipments — Yalidine, Zaki, Maystro — تتبع الشحنات',
    naturalTriggers: ['add shipment', 'track order', 'شحنة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['tracking', 'carrier', 'status', 'client'] },
  },
  {
    keywords: ['مرتجعات', 'استرجاع', 'return', 'returns', 'refund', 'مرتجع'],
    emoji: '🔄', category: 'operations',
    purpose: 'Returns and refunds tracking — المرتجعات والاسترجاع',
    naturalTriggers: ['add return', 'new refund', 'مرتجع جديد'],
    workflowHint: { type: 'title_first', keyFields: ['order', 'reason', 'status', 'amount'] },
  },
  {
    keywords: ['عروض', 'تخفيضات', 'promotion', 'promotions', 'discount', 'عرض', 'تخفيض', 'solde'],
    emoji: '🏷️', category: 'operations',
    purpose: 'Promotions and discounts — العروض والتخفيضات',
    naturalTriggers: ['add promotion', 'new discount', 'عرض جديد', 'تخفيض جديد'],
    workflowHint: { type: 'title_first', keyFields: ['discount_pct', 'start_date', 'end_date', 'products'] },
  },
  {
    keywords: ['عقود', 'اتفاقيات', 'contract', 'contracts', 'agreement', 'عقد', 'اتفاقية'],
    emoji: '⚖️', category: 'operations',
    purpose: 'Contracts and agreements — العقود والاتفاقيات',
    naturalTriggers: ['add contract', 'new agreement', 'عقد جديد'],
    workflowHint: { type: 'title_first', keyFields: ['party', 'start_date', 'end_date', 'value', 'status'] },
  },

  // =============== 📈 Growth & Management ===============
  {
    keywords: ['معرفة', 'sop', 'sops', 'knowledge', 'إجراء', 'إجراءات'],
    emoji: '🧠', category: 'growth',
    purpose: 'Documented procedures — never reinvent the wheel — قاعدة المعرفة والـ SOPs',
    naturalTriggers: ['add sop', 'new procedure', 'إجراء جديد', 'add knowledge'],
    workflowHint: { type: 'title_first', keyFields: ['category', 'department'] },
  },
  {
    keywords: ['محتوى', 'content', 'إدارة المحتوى', 'مقال', 'بوست'],
    emoji: '📣', category: 'growth',
    purpose: 'Content pipeline from idea to publish — إدارة المحتوى',
    naturalTriggers: ['add content', 'new post', 'محتوى جديد', 'مقال جديد'],
    workflowHint: { type: 'title_first', keyFields: ['type', 'platform', 'status', 'publish_date'] },
  },
  {
    keywords: ['مشاريع', 'مهام', 'task', 'tasks', 'project', 'projects', 'مهمة', 'مشروع'],
    emoji: '📋', category: 'growth',
    purpose: 'From idea to delivery — المشاريع والمهام',
    naturalTriggers: ['add task', 'new task', 'مهمة جديدة', 'مشروع جديد', 'create task'],
    workflowHint: { type: 'title_first', keyFields: ['status', 'priority', 'due_date', 'assignee'] },
  },
  {
    keywords: ['ماليات', 'ميزانية', 'finance', 'financial', 'budget', 'مالية'],
    emoji: '📊', category: 'growth',
    purpose: 'Income, expenses, and taxes in DZD — الماليات والميزانية',
    naturalTriggers: ['add expense', 'add income', 'مصروف جديد', 'دخل جديد'],
    workflowHint: { type: 'title_first', keyFields: ['amount', 'type', 'category', 'date'] },
  },
  {
    keywords: ['kpi', 'kpis', 'مؤشرات', 'أداء', 'performance', 'dashboard'],
    emoji: '📉', category: 'growth',
    purpose: 'KPI Dashboard — مؤشرات الأداء',
    naturalTriggers: ['add kpi', 'track metric', 'مؤشر جديد'],
    workflowHint: { type: 'title_first', keyFields: ['value', 'target', 'period'] },
  },
  {
    keywords: ['تقارير', 'تقرير', 'report', 'reports', 'شهري', 'monthly'],
    emoji: '📈', category: 'growth',
    purpose: 'Monthly reports — التقارير الشهرية',
    naturalTriggers: ['add report', 'new report', 'تقرير جديد'],
    workflowHint: { type: 'title_first', keyFields: ['period', 'highlights', 'metrics'] },
  },
  {
    keywords: ['أفكار', 'ابتكار', 'idea', 'ideas', 'innovation', 'فكرة', 'brainstorm'],
    emoji: '💡', category: 'growth',
    purpose: 'Ideas bank — بنك الأفكار والابتكار',
    naturalTriggers: ['add idea', 'new idea', 'فكرة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['category', 'priority', 'status'] },
  },

  // =============== 📢 Marketing & Content ===============
  {
    keywords: ['إيميل', 'email', 'campaign', 'campaigns', 'حملة', 'حملات', 'بريد'],
    emoji: '📧', category: 'marketing',
    purpose: 'Email campaigns — حملات الإيميل',
    naturalTriggers: ['add campaign', 'new email', 'حملة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['subject', 'audience', 'status', 'send_date'] },
  },
  {
    keywords: ['إعلانات', 'ads', 'ad', 'إعلان', 'advertising', 'pub'],
    emoji: '📺', category: 'marketing',
    purpose: 'Ads manager — إدارة الإعلانات',
    naturalTriggers: ['add ad', 'new ad', 'إعلان جديد'],
    workflowHint: { type: 'title_first', keyFields: ['platform', 'budget', 'status', 'target'] },
  },
  {
    keywords: ['سوشل', 'ميديا', 'social', 'تقويم', 'calendar', 'سوشل ميديا'],
    emoji: '📱', category: 'marketing',
    purpose: 'Social media calendar — تقويم السوشل ميديا',
    naturalTriggers: ['add social post', 'schedule post', 'بوست جديد'],
    workflowHint: { type: 'title_first', keyFields: ['platform', 'date', 'type', 'status'] },
  },
  {
    keywords: ['براند', 'brand', 'أصول', 'assets', 'هوية بصرية', 'logo'],
    emoji: '🎨', category: 'marketing',
    purpose: 'Brand assets — أصول البراند',
    naturalTriggers: ['add asset', 'new brand asset'],
    workflowHint: { type: 'title_first', keyFields: ['type', 'format', 'usage'] },
  },
  {
    keywords: ['بنك المحتوى', 'content bank', 'محتوى جاهز', 'swipe', 'copy'],
    emoji: '✏️', category: 'marketing',
    purpose: 'Content bank — بنك المحتوى',
    naturalTriggers: ['add to content bank', 'save content'],
    workflowHint: { type: 'title_first', keyFields: ['type', 'topic', 'platform'] },
  },

  // =============== 🤝 Team & Partnerships ===============
  {
    keywords: ['فريق', 'hr', 'team', 'موظف', 'موظفين', 'employee', 'staff'],
    emoji: '🧑‍💼', category: 'team',
    purpose: 'Team management & HR — إدارة الفريق',
    naturalTriggers: ['add employee', 'add team member', 'موظف جديد'],
    workflowHint: { type: 'title_first', keyFields: ['role', 'department', 'start_date', 'salary'] },
  },
  {
    keywords: ['شراكات', 'تعاونات', 'partnership', 'partnerships', 'شراكة', 'collaboration'],
    emoji: '🔗', category: 'team',
    purpose: 'Partnerships and collaborations — الشراكات والتعاونات',
    naturalTriggers: ['add partnership', 'شراكة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['partner', 'type', 'status', 'value'] },
  },
  {
    keywords: ['منافسين', 'competitor', 'competitors', 'منافس', 'competition'],
    emoji: '🏆', category: 'team',
    purpose: 'Competitor tracker — تحليل المنافسين',
    naturalTriggers: ['add competitor', 'track competitor', 'منافس جديد'],
    workflowHint: { type: 'title_first', keyFields: ['website', 'strengths', 'weaknesses'] },
  },

  // =============== 🎪 Events & Agents ===============
  {
    keywords: ['فعاليات', 'أحداث', 'event', 'events', 'فعالية', 'حدث'],
    emoji: '🎪', category: 'events',
    purpose: 'Events and occasions — الفعاليات والأحداث',
    naturalTriggers: ['add event', 'new event', 'فعالية جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['date', 'location', 'type', 'budget'] },
  },
  {
    keywords: ['agents', 'agent', 'وكيل', 'وكلاء', 'مبنية', 'بوت'],
    emoji: '🤖', category: 'events',
    purpose: 'Built agents log — سجل الـ Agents المبنية',
    naturalTriggers: ['add agent', 'log agent', 'وكيل جديد'],
    workflowHint: { type: 'title_first', keyFields: ['type', 'status', 'description'] },
  },

  // =============== 🧪 Experiments ===============
  {
    keywords: ['تجارب', 'test', 'a/b', 'experiment', 'تجربة', 'اختبار'],
    emoji: '🧪', category: 'experiments',
    purpose: 'A/B Test Lab — مختبر التجارب',
    naturalTriggers: ['add test', 'new experiment', 'تجربة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['hypothesis', 'variant_a', 'variant_b', 'metric'] },
  },
  {
    keywords: ['ترندات', 'trend', 'trends', 'ترند', 'رادار'],
    emoji: '🔮', category: 'experiments',
    purpose: 'Trend radar — رادار الترندات',
    naturalTriggers: ['add trend', 'ترند جديد'],
    workflowHint: { type: 'title_first', keyFields: ['source', 'industry', 'relevance'] },
  },
  {
    keywords: ['إلهام', 'سكرينشوت', 'swipe', 'inspiration', 'screenshot'],
    emoji: '📸', category: 'experiments',
    purpose: 'Swipe file & inspiration — بنك الإلهام',
    naturalTriggers: ['add inspiration', 'save screenshot', 'إلهام جديد'],
    workflowHint: { type: 'title_first', keyFields: ['source', 'category'] },
  },

  // =============== 🔐 Security & Decisions ===============
  {
    keywords: ['قرارات', 'decision', 'decisions', 'قرار'],
    emoji: '🧠', category: 'security',
    purpose: 'Decision log — سجل القرارات الكبرى',
    naturalTriggers: ['log decision', 'قرار جديد'],
    workflowHint: { type: 'title_first', keyFields: ['context', 'options', 'outcome', 'date'] },
  },
  {
    keywords: ['كلمات سر', 'حسابات', 'password', 'vault', 'سر', 'باسورد'],
    emoji: '🔐', category: 'security',
    purpose: 'Passwords and accounts vault — كلمات السر والحسابات',
    naturalTriggers: ['add account', 'save password', 'حساب جديد'],
    workflowHint: { type: 'title_first', keyFields: ['username', 'url', 'notes'] },
  },
  {
    keywords: ['مشاكل', 'أزمات', 'crisis', 'problem', 'مشكلة', 'أزمة'],
    emoji: '😡', category: 'security',
    purpose: 'Crisis log — سجل المشاكل والأزمات',
    naturalTriggers: ['log problem', 'add crisis', 'مشكلة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['severity', 'status', 'resolution', 'date'] },
  },

  // =============== 🚀 Personal Growth ===============
  {
    keywords: ['ولاء', 'loyalty', 'برنامج ولاء', 'نقاط', 'points'],
    emoji: '💎', category: 'personal',
    purpose: 'Loyalty program — برنامج الولاء',
    naturalTriggers: ['add to loyalty', 'نقاط ولاء'],
    workflowHint: { type: 'title_first', keyFields: ['client', 'points', 'tier'] },
  },
  {
    keywords: ['تعلم', 'تطوير', 'learning', 'course', 'دورة', 'كورس'],
    emoji: '🎓', category: 'personal',
    purpose: 'Learning tracker — التعلم والتطوير',
    naturalTriggers: ['add course', 'new learning', 'دورة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['platform', 'status', 'notes'] },
  },
  {
    keywords: ['توسع', 'ولايات', 'expansion', 'wilaya', 'خريطة'],
    emoji: '🌍', category: 'personal',
    purpose: 'Expansion map by wilaya — خريطة التوسع بالولايات',
    naturalTriggers: ['add wilaya', 'expansion target'],
    workflowHint: { type: 'title_first', keyFields: ['population', 'potential', 'status'] },
  },
  {
    keywords: ['عادات', 'روتين', 'habit', 'habits', 'daily', 'يومي'],
    emoji: '🔁', category: 'personal',
    purpose: 'Daily habits and routines — العادات والروتين اليومي',
    naturalTriggers: ['add habit', 'عادة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['frequency', 'time', 'streak'] },
  },

  // =============== ⏱️ Productivity ===============
  {
    keywords: ['وقت', 'time', 'ساعات', 'تتبع وقت', 'timesheet'],
    emoji: '🕙', category: 'productivity',
    purpose: 'Time tracker — سجل الوقت',
    naturalTriggers: ['log time', 'track time', 'سجّل وقت'],
    workflowHint: { type: 'title_first', keyFields: ['hours', 'project', 'date'] },
  },
  {
    keywords: ['اجتماعات', 'محاضر', 'meeting', 'meetings', 'minutes', 'اجتماع'],
    emoji: '📝', category: 'productivity',
    purpose: 'Meeting minutes — محاضر الاجتماعات',
    naturalTriggers: ['add meeting', 'meeting notes', 'اجتماع جديد'],
    workflowHint: { type: 'title_first', keyFields: ['date', 'attendees', 'decisions', 'actions'] },
  },
  {
    keywords: ['أهداف', 'okr', 'okrs', 'فصلية', 'quarterly', 'هدف'],
    emoji: '🎯', category: 'productivity',
    purpose: 'Quarterly OKRs — الأهداف الفصلية',
    naturalTriggers: ['add okr', 'new goal', 'هدف جديد'],
    workflowHint: { type: 'title_first', keyFields: ['key_results', 'quarter', 'progress'] },
  },
  {
    keywords: ['إنجازات', 'معالم', 'milestone', 'milestones', 'achievement', 'إنجاز'],
    emoji: '🏅', category: 'productivity',
    purpose: 'Milestones and achievements — الإنجازات والمعالم',
    naturalTriggers: ['add milestone', 'log achievement', 'إنجاز جديد'],
    workflowHint: { type: 'title_first', keyFields: ['date', 'impact', 'category'] },
  },
  {
    keywords: ['أرشيف', 'archive', 'مشاريع قديمة', 'أرشيف مشاريع'],
    emoji: '🗂️', category: 'productivity',
    purpose: 'Project archive — أرشيف المشاريع',
    naturalTriggers: ['archive project', 'أرشف مشروع'],
    workflowHint: { type: 'title_first', keyFields: ['status', 'end_date', 'outcome'] },
  },

  // =============== 🛠️ Tools ===============
  {
    keywords: ['أدوات', 'اشتراكات', 'tool', 'tools', 'tech', 'stack', 'subscription', 'أداة'],
    emoji: '🔧', category: 'tools',
    purpose: 'Tech stack and subscriptions — الأدوات والاشتراكات',
    naturalTriggers: ['add tool', 'new subscription', 'أداة جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['cost', 'category', 'url', 'renewal_date'] },
  },
  {
    keywords: ['تغييرات', 'changelog', 'تحديث', 'update', 'version'],
    emoji: '📖', category: 'tools',
    purpose: 'Changelog — سجل التغييرات',
    naturalTriggers: ['log change', 'add update', 'تحديث جديد'],
    workflowHint: { type: 'title_first', keyFields: ['version', 'type', 'description', 'date'] },
  },
  {
    keywords: ['هدايا', 'عينات', 'gift', 'gifts', 'sample', 'samples', 'هدية'],
    emoji: '🎁', category: 'tools',
    purpose: 'Gifts and samples — الهدايا والعينات',
    naturalTriggers: ['add gift', 'log sample', 'هدية جديدة'],
    workflowHint: { type: 'title_first', keyFields: ['recipient', 'occasion', 'cost'] },
  },
  {
    keywords: ['رحلة العميل', 'journey', 'customer journey', 'خريطة رحلة'],
    emoji: '🗺️', category: 'tools',
    purpose: 'Customer journey map — رحلة العميل',
    naturalTriggers: ['add journey stage', 'map journey'],
    workflowHint: { type: 'title_first', keyFields: ['stage', 'touchpoint', 'emotion', 'action'] },
  },

  // =============== Skills ===============
  {
    keywords: ['skills', 'skill', 'مكتبة', 'مهارات', 'مهارة'],
    emoji: '🧰', category: 'tools',
    purpose: '502 skills for building super agents — مكتبة الـ Skills',
    naturalTriggers: [],
    workflowHint: null, // Read-only, don't create
  },
];

/**
 * Get all registered databases with their metadata
 */
function getAll() {
  return DATABASE_MAP;
}

/**
 * Get databases by category
 */
function getByCategory(categoryKey) {
  return DATABASE_MAP.filter(db => db.category === categoryKey);
}

/**
 * Get all categories
 */
function getCategories() {
  return CATEGORIES;
}

/**
 * Find database registry entry by keywords
 */
function findByKeyword(keyword) {
  const lower = keyword.toLowerCase();
  return DATABASE_MAP.find(db =>
    db.keywords.some(k => lower.includes(k) || k.includes(lower))
  );
}

/**
 * Find database by natural trigger phrase
 */
function findByTrigger(phrase) {
  const lower = phrase.toLowerCase();
  for (const db of DATABASE_MAP) {
    for (const trigger of db.naturalTriggers) {
      if (lower.includes(trigger)) return db;
    }
  }
  return null;
}

/**
 * Get all keywords for cache indexing (flat list)
 */
function getAllKeywords() {
  const keywords = {};
  for (const db of DATABASE_MAP) {
    for (const kw of db.keywords) {
      keywords[kw] = db;
    }
  }
  return keywords;
}

module.exports = { DATABASE_MAP, CATEGORIES, getAll, getByCategory, getCategories, findByKeyword, findByTrigger, getAllKeywords };

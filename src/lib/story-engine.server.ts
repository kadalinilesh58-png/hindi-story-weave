import { paralonChat, cleanHindi, countWords, extractJson } from "./paralon.server";

export type StoryPlan = {
  title: string;
  logline: string;
  characters: string;
  tone: string;
  chapters: { no: number; title: string; outline: string }[];
};

export const SCENES_PER_CHAPTER = 7;
export const CHAPTERS_PER_PART = 20;
export const TARGET_WORDS = 80000;

const STYLE_RULES = `नियम जो हर हाल में मानने हैं
कहानी सिर्फ़ हिंदी देवनागरी में लिखो। पूरी कहानी में सिर्फ़ आसान बोलचाल की हिंदी चलेगी। रोज़ाना बोले जाने वाले शब्द ही लिखो। कठिन या किताबी शब्द कभी मत लिखो।
भाषा नरम, अपनापन भरी और सीधी हो। पढ़ते ही समझ में आ जाए।
यह कहानी आगे आवाज़ में बदली जाएगी, इसलिए ऐसे शब्द मत लिखो जो हिंदी में बोलने पर कानों को चुभें।
किसी भी तरह का चिन्ह, इमोजी, नंबर, तारा, कोष्ठक या अंग्रेज़ी अक्षर मत लिखो। सिर्फ़ पूर्ण विराम, अल्प विराम, प्रश्न चिन्ह और विस्मय चिन्ह चलेंगे।
बातचीत असली लगे और मौके के हिसाब से हो। विराम चिन्ह ठीक जगह लगाओ।
कहानी में हुक, मोड़, सस्पेंस, भावना, हँसी मज़ाक, ड्रामा सब हो, ताकि पढ़ने वाला रुक ही न पाए।
कोई शीर्षक, कोई अध्याय का नाम, कोई सूची मत लिखो। बस बहती हुई कहानी लिखो।`;

export function planPrompt(summary: string, notes: string | null, partNumber: number, previousRecap: string) {
  const partLine =
    partNumber === 1
      ? "यह कहानी का पहला भाग है।"
      : `यह कहानी का भाग ${"एक दो तीन चार पाँच".split(" ")[partNumber - 1] ?? partNumber} है। पिछले भाग की कहानी आगे बढ़ानी है, दोहरानी नहीं है।`;
  const ending =
    partNumber >= 5
      ? "यह आख़िरी भाग है, इसलिए इस भाग में कहानी का पूरा अंत होगा।"
      : "इस भाग का अंत खुला रखना है, ताकि आगे का भाग बन सके।";

  return `तुम एक मंगा कहानी की योजना बनाने वाले हो।
अंग्रेज़ी सारांश
${summary}
${notes ? `पाठक की ख़ास बातें\n${notes}` : ""}
${previousRecap ? `पिछले भाग का सार\n${previousRecap}` : ""}
${partLine}
${ending}

पूरे सारांश को समझो और एक लंबी मंगा कहानी की योजना बनाओ जिसमें ठीक ${CHAPTERS_PER_PART} अध्याय हों।
सिर्फ़ जेसन लौटाओ, इस ढाँचे में
{"title":"हिंदी में कहानी का नाम","logline":"दो लाइन में कहानी","characters":"मुख्य किरदारों का छोटा परिचय","tone":"कहानी का मिजाज़","chapters":[{"no":1,"title":"हिंदी नाम","outline":"इस अध्याय में क्या क्या होगा, कम से कम चालीस शब्द में, मोड़ और भावना के साथ"}]}
जेसन के अंदर की सारी लिखाई हिंदी में हो। जेसन के बाहर कुछ मत लिखो।`;
}

export async function buildPlan(
  summary: string,
  notes: string | null,
  partNumber: number,
  previousRecap: string,
): Promise<StoryPlan> {
  const raw = await paralonChat(
    [
      { role: "system", content: "तुम हिंदी मंगा कहानियों के योजनाकार हो। तुम सिर्फ़ मान्य जेसन लौटाते हो।" },
      { role: "user", content: planPrompt(summary, notes, partNumber, previousRecap) },
    ],
    { maxTokens: 3000, temperature: 0.8 },
  );
  const plan = extractJson<StoryPlan>(raw);
  if (!Array.isArray(plan.chapters) || plan.chapters.length === 0) {
    throw new Error("योजना में अध्याय नहीं मिले");
  }
  plan.chapters = plan.chapters.slice(0, CHAPTERS_PER_PART).map((chapter, index) => ({
    no: index + 1,
    title: cleanHindi(String(chapter.title ?? "")) || `अध्याय`,
    outline: cleanHindi(String(chapter.outline ?? "")),
  }));
  plan.title = cleanHindi(String(plan.title ?? "")) || "मंगा कहानी";
  plan.logline = cleanHindi(String(plan.logline ?? ""));
  plan.characters = cleanHindi(String(plan.characters ?? ""));
  plan.tone = cleanHindi(String(plan.tone ?? ""));
  return plan;
}

export function sceneRows(plan: StoryPlan, partId: string) {
  const rows: {
    part_id: string;
    idx: number;
    chapter_no: number;
    chapter_title: string;
    brief: string;
  }[] = [];
  let idx = 0;
  for (const chapter of plan.chapters) {
    for (let s = 0; s < SCENES_PER_CHAPTER; s++) {
      rows.push({
        part_id: partId,
        idx: idx++,
        chapter_no: chapter.no,
        chapter_title: chapter.title,
        brief: `${chapter.outline}\nइस अध्याय का हिस्सा ${s + 1} में से ${SCENES_PER_CHAPTER}।${
          s === 0 ? " यहाँ अध्याय शुरू होता है, शुरुआत में ही एक हुक दो।" : ""
        }${s === SCENES_PER_CHAPTER - 1 ? " यहाँ अध्याय ख़त्म होता है, आख़िर में आगे का सस्पेंस छोड़ो।" : ""}`,
      });
    }
  }
  return rows;
}

export async function writeScene(args: {
  plan: StoryPlan;
  brief: string;
  chapterTitle: string;
  previousTail: string;
  isFinalScene: boolean;
  isLastPart: boolean;
}): Promise<string> {
  const { plan, brief, chapterTitle, previousTail, isFinalScene, isLastPart } = args;
  const closing = isFinalScene
    ? isLastPart
      ? "\nयह कहानी का आख़िरी हिस्सा है। यहाँ कहानी का पूरा और साफ़ अंत करो।"
      : "\nयह इस भाग का आख़िरी हिस्सा है। अंत खुला छोड़ो, कोई बड़ा सवाल हवा में छोड़ दो।"
    : "";

  const user = `कहानी का नाम
${plan.title}
कहानी एक झलक में
${plan.logline}
किरदार
${plan.characters}
मिजाज़
${plan.tone}
इस समय का अध्याय
${chapterTitle}
इस हिस्से में क्या लिखना है
${brief}
${previousTail ? `पिछले हिस्से की आख़िरी लाइनें\n${previousTail}` : ""}

${STYLE_RULES}${closing}

अब यही हिस्सा लिखो। कम से कम सात सौ शब्द। बीच बीच में किरदारों की बातचीत रखो। सीधे कहानी से शुरू करो।`;

  const raw = await paralonChat(
    [
      {
        role: "system",
        content:
          "तुम हिंदी के मंगा कहानीकार हो। तुम सिर्फ़ आसान बोलचाल की हिंदी में कहानी लिखते हो। तुम कोई चिन्ह, नंबर, इमोजी या अंग्रेज़ी नहीं लिखते।",
      },
      { role: "user", content: user },
    ],
    { maxTokens: 2000, temperature: 0.95 },
  );
  return cleanHindi(raw);
}

export async function recapPart(text: string): Promise<string> {
  const sample = `${text.slice(0, 6000)}\n\n${text.slice(-6000)}`;
  try {
    const raw = await paralonChat(
      [
        { role: "system", content: "तुम हिंदी में छोटा सार लिखते हो।" },
        {
          role: "user",
          content: `नीचे एक हिंदी कहानी के हिस्से हैं। इसका सार तीन सौ शब्द में आसान हिंदी में लिखो, किरदार और आख़िरी हालत साफ़ लिखो।\n\n${sample}`,
        },
      ],
      { maxTokens: 900, temperature: 0.5 },
    );
    return cleanHindi(raw);
  } catch {
    return cleanHindi(text.slice(-4000));
  }
}

export { countWords };

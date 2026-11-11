import { readGeminiText } from './gemini-response-text';

describe('readGeminiText', () => {
  it('prefers response.text', () => {
    expect(readGeminiText({ text: ' {"category":{}} ' })).toContain('category');
  });

  it('reads the answer part when text is empty and skips thoughts', () => {
    const text = readGeminiText({
      text: '   ',
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: 'Ich überlege…' },
              { text: '{"brand":{"value":"Bosch","confidence":0.9}}' },
            ],
          },
        },
      ],
    });
    expect(text).toContain('Bosch');
    expect(text).not.toContain('überlege');
  });

  it('returns undefined when nothing usable was returned', () => {
    expect(readGeminiText({ text: '', candidates: [] })).toBeUndefined();
    expect(readGeminiText(null)).toBeUndefined();
  });
});

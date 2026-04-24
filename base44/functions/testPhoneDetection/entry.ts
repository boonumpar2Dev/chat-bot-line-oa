import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Pure phone detection logic — extracted from lineWebhook for testing
function detectPhone(messageText) {
  const pureDigits = messageText.replace(/[\s\-().+]/g, '');
  const isPureNumber = /^\d+$/.test(pureDigits);
  const phoneSeqs = messageText.match(/\d[\d\s\-().]{6,25}\d/g) || [];
  let phoneCandidate = null;

  if (isPureNumber && pureDigits.length >= 7 && pureDigits.length <= 15) {
    phoneCandidate = pureDigits;
  } else {
    for (const seq of phoneSeqs) {
      const digits = seq.replace(/[^0-9]/g, '');
      if (digits.length >= 7 && digits.length <= 15) { phoneCandidate = digits; break; }
    }
  }

  if (phoneCandidate) {
    const nonDigitText = messageText.replace(/[0-9\s\-().+]/g, '').trim();
    if (nonDigitText.length > 15) phoneCandidate = null;
  }

  // Normalize +66 / 66 prefix to 0
  const normalized = phoneCandidate && /^66\d{8,9}$/.test(phoneCandidate);
  if (normalized) {
    phoneCandidate = '0' + phoneCandidate.slice(2);
  }

  // Determine result
  if (!phoneCandidate) {
    return { detected: false, candidate: null, result: 'not_a_phone' };
  }

  // Thai mobile: 10 digits, landline: 9 digits
  if (/^0\d{8,9}$/.test(phoneCandidate)) {
    return { detected: true, candidate: phoneCandidate, normalized, result: 'valid_thai_phone' };
  }

  if ((phoneCandidate.length === 9 || phoneCandidate.length === 10) && !/^0/.test(phoneCandidate)) {
    return { detected: true, candidate: phoneCandidate, normalized, result: 'error_no_leading_zero' };
  }

  if (phoneCandidate.length >= 7 && (phoneCandidate.length < 9 || phoneCandidate.length > 10)) {
    return { detected: true, candidate: phoneCandidate, normalized, result: 'error_wrong_digit_count', digitCount: phoneCandidate.length };
  }

  return { detected: false, candidate: phoneCandidate, result: 'not_a_phone' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const testCases = [
      // Valid Thai phones
      { input: '0812345678', expected: 'valid_thai_phone' },
      { input: '081-234-5678', expected: 'valid_thai_phone' },
      { input: '081 234 5678', expected: 'valid_thai_phone' },
      { input: '(081) 234-5678', expected: 'valid_thai_phone' },
      
      // +66 format (should normalize to 0xx)
      { input: '+66812345678', expected: 'valid_thai_phone' },
      { input: '+66 81 234 5678', expected: 'valid_thai_phone' },
      { input: '+66-81-234-5678', expected: 'valid_thai_phone' },
      { input: '66812345678', expected: 'valid_thai_phone' },
      { input: '+66 2345 6789', expected: 'valid_thai_phone' },
      { input: '+66 5345 6789', expected: 'valid_thai_phone' },
      
      // Invalid: 10 digits but no leading 0
      { input: '1234567890', expected: 'error_no_leading_zero' },
      
      // Invalid: wrong digit count
      { input: '08123456', expected: 'error_wrong_digit_count' },
      { input: '081234567890', expected: 'error_wrong_digit_count' },
      { input: '012345678', expected: 'valid_thai_phone' }, // 9 digits = valid landline
      
      // Not a phone (too much surrounding text)
      { input: 'สวัสดีครับ สนใจจัดเลี้ยงงานบุญครับ', expected: 'not_a_phone' },
      { input: 'มีแพ็กเกจสำหรับ 40 คนไหมครับ', expected: 'not_a_phone' },
      { input: 'ขอบคุณครับ', expected: 'not_a_phone' },
      
      // Edge cases
      { input: 'เบอร์ 0812345678 ครับ', expected: 'valid_thai_phone' },
      { input: 'โทร +66812345678 นะครับ', expected: 'valid_thai_phone' },
      { input: '+66 234 5678', expected: 'error_no_leading_zero' }, // 66+7 digits = not enough for normalize, falls through as 9-digit no leading 0
      
      // Landline phones
      { input: '021234567', expected: 'valid_thai_phone' },
      { input: '02-123-4567', expected: 'valid_thai_phone' },
      { input: '+6621234567', expected: 'valid_thai_phone' },
    ];

    const results = testCases.map(tc => {
      const result = detectPhone(tc.input);
      const pass = result.result === tc.expected;
      return {
        input: tc.input,
        expected: tc.expected,
        got: result.result,
        candidate: result.candidate,
        normalized: result.normalized || false,
        pass,
      };
    });

    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;

    const failures = results.filter(r => !r.pass);
    return Response.json({
      summary: `${passed}/${results.length} passed, ${failed} failed`,
      failures,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});
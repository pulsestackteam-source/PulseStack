/**
 * Cloudflare Worker: Генератор и чекер никнеймов для Telegram
 */

// Конфигурация Leet Speak
const LEET_MAP: Record<string, string> = {
  'a': '4', 'e': '3', 'i': '1', 'o': '0', 's': '5', 't': '7', 'l': '1'
};

function leetSpeak(text: string): string {
  return text.split('').map(char => {
    const lower = char.toLowerCase();
    // 30% шанс замены символа, как в твоем скрипте
    if (LEET_MAP[lower] && Math.random() < 0.3) {
      return LEET_MAP[lower];
    }
    return char;
  }).join('');
}

function generateBaseUsername(length: number): string {
  const vowels = "aeiou";
  const consonants = "bcdfghjklmnpqrstvwxyz";
  let username = "";
  let useVowel = false;

  for (let i = 0; i < length; i++) {
    if (useVowel) {
      username += vowels[Math.floor(Math.random() * vowels.length)];
    } else {
      username += consonants[Math.floor(Math.random() * consonants.length)];
    }
    useVowel = !useVowel;
  }
  
  // Небольшая вариативность (как в оригинале)
  if (Math.random() < 0.2 && username.length > 2) {
    const idx = Math.floor(Math.random() * (username.length - 2)) + 1;
    if (consonants.includes(username[idx])) {
       username = username.substring(0, idx) + vowels[Math.floor(Math.random() * vowels.length)] + username.substring(idx + 1);
    }
  }
  return username;
}

async function checkUsernameOnFragment(username: string): Promise<boolean> {
  const url = `https://fragment.com/username/${username}`;
  try {
    // Делаем запрос к Fragment
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      },
      cf: {
        cacheTtl: 0, // Не кэшируем ответ проверки, чтобы данные были свежими
      }
    });
    
    const text = await response.text();
    // Логика из твоего скрипта: если ответ короткий (< 20000 символов), скорее всего свободно
    // Примечание: Fragment может менять верстку, этот метод эвристический.
    if (text.length < 20000) {
      return true; 
    }
    return false;
  } catch (e) {
    console.error("Error checking username:", e);
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Эндпоинт: /api/check-random
    if (url.pathname === '/api/check-random') {
      
      let foundName = null;
      let attempts = 0;
      const maxAttempts = 50; // Ограничитель, чтобы Worker не завис

      while (!foundName && attempts < maxAttempts) {
        attempts++;
        
        // 1. Генерируем базу (6 или 7 символов)
        const length = Math.random() < 0.5 ? 6 : 7;
        const baseName = generateBaseUsername(length);
        
        // 2. Применяем Leet Speak
        const finalName = leetSpeak(baseName);
        
        // 3. Проверяем доступность
        const isAvailable = await checkUsernameOnFragment(finalName);
        
        if (isAvailable) {
          foundName = finalName;
        }
        
        // Небольшая задержка не нужна в Serverless так же, как в цикле Python, 
        // но мы ограничены временем выполнения Worker (10ms-30s).
      }

      if (foundName) {
        return new Response(JSON.stringify({ 
          status: 'success', 
          username: foundName,
          attempts: attempts 
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ 
          status: 'fail', 
          message: 'Не удалось найти свободный ник за 50 попыток' 
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Use /api/check-random', { status: 404 });
  },
};

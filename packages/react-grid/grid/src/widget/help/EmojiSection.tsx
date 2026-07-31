/**
 * 5. Emoji Gallery — click-to-copy emoji tiles grouped by theme:
 * traffic lights, arrows, check/cross/warning, finance, signals,
 * shapes, letters/numbers, currencies, flags, weather, desk tools,
 * security, and dashboard misc.
 */

import { EmojiGrid } from './EmojiGrid';
import { H1, H2, Pre } from './primitives';

export function EmojiSection() {
  return (
    <>
      <H1>5. Emoji Gallery</H1>
      <p className="ds-help-p">
        Every emoji here is a single Unicode string. Click a tile to copy it to
        the clipboard, then paste into an Excel format or expression:
      </p>
      <Pre>{`// in a custom Excel format
[=1]"🟢";[=2]"🟡";[=3]"🔴"

// in a calc-column expression
IFS([price] >= 105, "🟢", [price] >= 95, "🟡", "🔴")

// mixed with text via CONCAT
CONCAT("📈 ", [security], " ", [side])`}</Pre>
      <p className="my-1.5 text-muted-foreground text-[11px]">
        <strong>Tip:</strong> when you need group-row aggregation, use a
        numeric 1 / 2 / 3 (or N / S / E / W, etc.) from the expression and let
        the Excel format render the emoji — see the Traffic Light walkthrough.
        Lexicographic MIN / MAX on emoji strings isn't semantically meaningful.
      </p>

      <H2>Traffic lights &amp; status circles</H2>
      <EmojiGrid
        items={[
          { emoji: '🟢', label: 'green' },
          { emoji: '🟡', label: 'yellow' },
          { emoji: '🟠', label: 'orange' },
          { emoji: '🔴', label: 'red' },
          { emoji: '🟣', label: 'purple' },
          { emoji: '🔵', label: 'blue' },
          { emoji: '🟤', label: 'brown' },
          { emoji: '⚫', label: 'black' },
          { emoji: '⚪', label: 'white' },
        ]}
      />

      <H2>Directional arrows</H2>
      <EmojiGrid
        items={[
          { emoji: '▲', label: 'up-tri' },
          { emoji: '▼', label: 'down-tri' },
          { emoji: '◀', label: 'left-tri' },
          { emoji: '▶', label: 'right-tri' },
          { emoji: '⬆', label: 'up' },
          { emoji: '⬇', label: 'down' },
          { emoji: '⬅', label: 'left' },
          { emoji: '➡', label: 'right' },
          { emoji: '↗', label: 'NE' },
          { emoji: '↘', label: 'SE' },
          { emoji: '↙', label: 'SW' },
          { emoji: '↖', label: 'NW' },
          { emoji: '↔', label: 'h-flip' },
          { emoji: '↕', label: 'v-flip' },
          { emoji: '🔼', label: 'up-block' },
          { emoji: '🔽', label: 'down-block' },
          { emoji: '⤴', label: 'up-right-arr' },
          { emoji: '⤵', label: 'down-right-arr' },
          { emoji: '🔀', label: 'shuffle' },
          { emoji: '🔃', label: 'cycle' },
          { emoji: '🔄', label: 'recycle' },
        ]}
      />

      <H2>Check / cross / warning</H2>
      <EmojiGrid
        items={[
          { emoji: '✅', label: 'check' },
          { emoji: '❌', label: 'cross' },
          { emoji: '⚠️', label: 'warning' },
          { emoji: '🛑', label: 'stop-sign' },
          { emoji: '⛔', label: 'no-entry' },
          { emoji: '🚫', label: 'prohibited' },
          { emoji: '✔', label: 'check-mk' },
          { emoji: '✖', label: 'x-mk' },
          { emoji: '❎', label: 'neg-check' },
          { emoji: '❗', label: 'red-!' },
          { emoji: '❕', label: 'white-!' },
          { emoji: '❓', label: 'red-?' },
          { emoji: '❔', label: 'white-?' },
          { emoji: '✴️', label: '8-star' },
          { emoji: '✳️', label: '8-spoked' },
          { emoji: 'ℹ️', label: 'info' },
          { emoji: '⁉️', label: 'exclaim-?' },
          { emoji: '‼️', label: 'double-!' },
        ]}
      />

      <H2>Finance &amp; markets</H2>
      <EmojiGrid
        items={[
          { emoji: '📈', label: 'up-chart' },
          { emoji: '📉', label: 'down-chart' },
          { emoji: '📊', label: 'bar-chart' },
          { emoji: '💹', label: 'stock-up' },
          { emoji: '💰', label: 'moneybag' },
          { emoji: '💵', label: 'USD' },
          { emoji: '💴', label: 'JPY' },
          { emoji: '💶', label: 'EUR' },
          { emoji: '💷', label: 'GBP' },
          { emoji: '💸', label: 'flying-money' },
          { emoji: '💳', label: 'card' },
          { emoji: '🪙', label: 'coin' },
          { emoji: '💎', label: 'diamond' },
          { emoji: '🏦', label: 'bank' },
          { emoji: '🏛', label: 'classical' },
          { emoji: '💲', label: '$-sign' },
          { emoji: '🧾', label: 'receipt' },
        ]}
      />

      <H2>Signals &amp; alerts</H2>
      <EmojiGrid
        items={[
          { emoji: '🚀', label: 'rocket' },
          { emoji: '🔥', label: 'fire' },
          { emoji: '❄️', label: 'cold' },
          { emoji: '⚡', label: 'bolt' },
          { emoji: '💥', label: 'boom' },
          { emoji: '🎯', label: 'target' },
          { emoji: '🔔', label: 'bell-on' },
          { emoji: '🔕', label: 'bell-off' },
          { emoji: '🚨', label: 'siren' },
          { emoji: '🎉', label: 'party' },
          { emoji: '🏁', label: 'checker-flag' },
          { emoji: '⏳', label: 'hourglass' },
          { emoji: '⏰', label: 'alarm' },
          { emoji: '⏱', label: 'stopwatch' },
          { emoji: '⏲', label: 'timer' },
          { emoji: '🕰', label: 'mantel-clock' },
        ]}
      />

      <H2>Shapes</H2>
      <EmojiGrid
        items={[
          { emoji: '🔺', label: 'up-tri' },
          { emoji: '🔻', label: 'down-tri' },
          { emoji: '🔶', label: 'big-dia' },
          { emoji: '🔷', label: 'big-dia-blu' },
          { emoji: '🔸', label: 'sm-dia-orng' },
          { emoji: '🔹', label: 'sm-dia-blu' },
          { emoji: '🟥', label: 'red-sq' },
          { emoji: '🟧', label: 'orng-sq' },
          { emoji: '🟨', label: 'yel-sq' },
          { emoji: '🟩', label: 'grn-sq' },
          { emoji: '🟦', label: 'blu-sq' },
          { emoji: '🟪', label: 'prpl-sq' },
          { emoji: '🟫', label: 'brn-sq' },
          { emoji: '⬛', label: 'blk-sq' },
          { emoji: '⬜', label: 'wht-sq' },
          { emoji: '●', label: 'dot-blk' },
          { emoji: '○', label: 'dot-wht' },
          { emoji: '◉', label: 'bullseye' },
        ]}
      />

      <H2>Letters (enclosed)</H2>
      <EmojiGrid
        items={[
          { emoji: 'Ⓐ', label: '(A)' },
          { emoji: 'Ⓑ', label: '(B)' },
          { emoji: 'Ⓒ', label: '(C)' },
          { emoji: 'Ⓓ', label: '(D)' },
          { emoji: 'Ⓔ', label: '(E)' },
          { emoji: '🅰', label: 'A-red' },
          { emoji: '🅱', label: 'B-red' },
          { emoji: '🅾', label: 'O-red' },
          { emoji: '🅿', label: 'P-red' },
          { emoji: '🆎', label: 'AB' },
          { emoji: '🆑', label: 'CL' },
          { emoji: '🆒', label: 'COOL' },
          { emoji: '🆓', label: 'FREE' },
          { emoji: '🆔', label: 'ID' },
          { emoji: '🆕', label: 'NEW' },
          { emoji: '🆖', label: 'NG' },
          { emoji: '🆗', label: 'OK' },
          { emoji: '🆘', label: 'SOS' },
          { emoji: '🆙', label: 'UP!' },
          { emoji: '🆚', label: 'VS' },
          { emoji: 'Ⓜ', label: '(M)' },
        ]}
      />

      <H2>Numbers (enclosed)</H2>
      <EmojiGrid
        items={[
          { emoji: '0️⃣', label: '0' },
          { emoji: '1️⃣', label: '1' },
          { emoji: '2️⃣', label: '2' },
          { emoji: '3️⃣', label: '3' },
          { emoji: '4️⃣', label: '4' },
          { emoji: '5️⃣', label: '5' },
          { emoji: '6️⃣', label: '6' },
          { emoji: '7️⃣', label: '7' },
          { emoji: '8️⃣', label: '8' },
          { emoji: '9️⃣', label: '9' },
          { emoji: '🔟', label: '10' },
          { emoji: '#️⃣', label: 'hash' },
          { emoji: '*️⃣', label: 'star' },
        ]}
      />

      <H2>Currency symbols</H2>
      <EmojiGrid
        items={[
          { emoji: '₿', label: 'BTC' },
          { emoji: '$', label: 'USD' },
          { emoji: '€', label: 'EUR' },
          { emoji: '£', label: 'GBP' },
          { emoji: '¥', label: 'JPY / CNY' },
          { emoji: '₹', label: 'INR' },
          { emoji: '₩', label: 'KRW' },
          { emoji: '₪', label: 'ILS' },
          { emoji: '₱', label: 'PHP' },
          { emoji: '₴', label: 'UAH' },
          { emoji: '฿', label: 'THB' },
          { emoji: '₽', label: 'RUB' },
        ]}
      />

      <H2>Flags — G10 + majors</H2>
      <EmojiGrid
        items={[
          { emoji: '🇺🇸', label: 'USD' },
          { emoji: '🇬🇧', label: 'GBP' },
          { emoji: '🇪🇺', label: 'EUR' },
          { emoji: '🇯🇵', label: 'JPY' },
          { emoji: '🇨🇳', label: 'CNY' },
          { emoji: '🇭🇰', label: 'HKD' },
          { emoji: '🇹🇼', label: 'TWD' },
          { emoji: '🇰🇷', label: 'KRW' },
          { emoji: '🇸🇬', label: 'SGD' },
          { emoji: '🇮🇳', label: 'INR' },
          { emoji: '🇦🇺', label: 'AUD' },
          { emoji: '🇳🇿', label: 'NZD' },
          { emoji: '🇨🇦', label: 'CAD' },
          { emoji: '🇨🇭', label: 'CHF' },
          { emoji: '🇩🇪', label: 'DE' },
          { emoji: '🇫🇷', label: 'FR' },
          { emoji: '🇮🇹', label: 'IT' },
          { emoji: '🇪🇸', label: 'ES' },
          { emoji: '🇳🇱', label: 'NL' },
        ]}
      />

      <H2>Flags — EM &amp; ROW</H2>
      <EmojiGrid
        items={[
          { emoji: '🇲🇽', label: 'MXN' },
          { emoji: '🇧🇷', label: 'BRL' },
          { emoji: '🇦🇷', label: 'ARS' },
          { emoji: '🇨🇱', label: 'CLP' },
          { emoji: '🇨🇴', label: 'COP' },
          { emoji: '🇵🇪', label: 'PEN' },
          { emoji: '🇿🇦', label: 'ZAR' },
          { emoji: '🇹🇷', label: 'TRY' },
          { emoji: '🇸🇦', label: 'SAR' },
          { emoji: '🇦🇪', label: 'AED' },
          { emoji: '🇶🇦', label: 'QAR' },
          { emoji: '🇰🇼', label: 'KWD' },
          { emoji: '🇧🇭', label: 'BHD' },
          { emoji: '🇮🇱', label: 'ILS' },
          { emoji: '🇹🇭', label: 'THB' },
          { emoji: '🇮🇩', label: 'IDR' },
          { emoji: '🇲🇾', label: 'MYR' },
          { emoji: '🇵🇭', label: 'PHP' },
          { emoji: '🇻🇳', label: 'VND' },
        ]}
      />

      <H2>Weather (risk / volatility)</H2>
      <EmojiGrid
        items={[
          { emoji: '☀️', label: 'calm' },
          { emoji: '🌤', label: 'mostly-sun' },
          { emoji: '⛅', label: 'partly' },
          { emoji: '🌥', label: 'mostly-cloud' },
          { emoji: '☁️', label: 'cloudy' },
          { emoji: '🌦', label: 'sun-shower' },
          { emoji: '🌧', label: 'rain' },
          { emoji: '⛈', label: 'thunderstorm' },
          { emoji: '🌩', label: 'lightning' },
          { emoji: '🌨', label: 'snow' },
          { emoji: '❄️', label: 'cold' },
          { emoji: '☔', label: 'umbrella' },
          { emoji: '🌪', label: 'tornado' },
          { emoji: '🌫', label: 'foggy' },
          { emoji: '🌈', label: 'rainbow' },
        ]}
      />

      <H2>Desk tools</H2>
      <EmojiGrid
        items={[
          { emoji: '🖥', label: 'desktop' },
          { emoji: '💻', label: 'laptop' },
          { emoji: '📱', label: 'phone' },
          { emoji: '⌨️', label: 'kbd' },
          { emoji: '🖱', label: 'mouse' },
          { emoji: '🖨', label: 'printer' },
          { emoji: '📇', label: 'rolodex' },
          { emoji: '📋', label: 'clipboard' },
          { emoji: '📁', label: 'folder' },
          { emoji: '📂', label: 'open-folder' },
          { emoji: '🗂', label: 'divider' },
          { emoji: '🗃', label: 'box-files' },
          { emoji: '🗄', label: 'cabinet' },
          { emoji: '📎', label: 'paperclip' },
          { emoji: '📐', label: 'tri-ruler' },
          { emoji: '📏', label: 'ruler' },
          { emoji: '📑', label: 'tabs' },
          { emoji: '📒', label: 'ledger' },
          { emoji: '📓', label: 'notebook' },
          { emoji: '📕', label: 'red-book' },
          { emoji: '📗', label: 'green-book' },
          { emoji: '📘', label: 'blue-book' },
          { emoji: '📙', label: 'orange-book' },
        ]}
      />

      <H2>Security &amp; permissions</H2>
      <EmojiGrid
        items={[
          { emoji: '🔒', label: 'locked' },
          { emoji: '🔓', label: 'unlocked' },
          { emoji: '🔐', label: 'lock+key' },
          { emoji: '🔑', label: 'key' },
          { emoji: '🗝', label: 'old-key' },
          { emoji: '🛡', label: 'shield' },
          { emoji: '🛠', label: 'tools' },
          { emoji: '⚙️', label: 'gear' },
          { emoji: '🔧', label: 'wrench' },
          { emoji: '🔨', label: 'hammer' },
          { emoji: '⚒', label: 'hammer-pick' },
        ]}
      />

      <H2>Dashboard misc</H2>
      <EmojiGrid
        items={[
          { emoji: '🔍', label: 'magnify-L' },
          { emoji: '🔎', label: 'magnify-R' },
          { emoji: '🔖', label: 'bookmark' },
          { emoji: '📌', label: 'push-pin' },
          { emoji: '📍', label: 'location' },
          { emoji: '🚩', label: 'red-flag' },
          { emoji: '🏷', label: 'tag' },
          { emoji: '🎫', label: 'ticket' },
          { emoji: '🏆', label: 'trophy' },
          { emoji: '🥇', label: 'gold' },
          { emoji: '🥈', label: 'silver' },
          { emoji: '🥉', label: 'bronze' },
          { emoji: '🏅', label: 'medal' },
          { emoji: '🎖', label: 'military' },
          { emoji: '🎗', label: 'ribbon' },
          { emoji: '💡', label: 'idea' },
          { emoji: '🧠', label: 'brain' },
          { emoji: '🧭', label: 'compass' },
          { emoji: '🗺', label: 'map' },
        ]}
      />
    </>
  );
}

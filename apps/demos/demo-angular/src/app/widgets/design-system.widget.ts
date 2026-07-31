import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'design-system-widget',
  standalone: true,
  imports: [CommonModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%;overflow-y:auto' },
  template: `
    <div style="padding:24px 32px;max-width:1200px">
      <!-- ══════════════════════════════════════════════════════ -->
      <!-- HEADER -->
      <!-- ══════════════════════════════════════════════════════ -->
      <div style="margin-bottom:32px">
        <h1
          style="font-size:18px;font-weight:700;color:var(--ds-text-primary);margin:0 0 4px 0;font-family:var(--ds-font-sans)"
        >
          FI Design System
        </h1>
        <p style="font-size:11px;color:var(--ds-text-muted);margin:0;font-family:var(--ds-font-mono)">
          Color palette, typography, spacing, and component reference. Dark theme + VS Code Light
          Modern-style light theme. All values adapt via CSS custom properties.
        </p>
      </div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 1. COLOR PALETTE -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">1. Color Palette</div>

        <!-- Surface Colors -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Surface Colors</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <div *ngFor="let s of surfaceColors" class="ds-swatch" [style.background]="s.var">
              <span class="ds-swatch-label">{{ s.name }}</span>
              <span class="ds-swatch-hex">{{ s.hex }}</span>
            </div>
          </div>
        </div>

        <!-- Text Colors -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Text Colors</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div
              *ngFor="let t of textColors"
              style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--ds-surface-primary);border-radius:3px;border:1px solid var(--ds-border-primary)"
            >
              <span
                style="font-size:13px;font-family:var(--ds-font-mono);font-weight:600"
                [style.color]="t.var"
                >Sample Text</span
              >
              <span style="font-size:9px;color:var(--ds-text-muted);font-family:var(--ds-font-mono)"
                >{{ t.name }} {{ t.hex }}</span
              >
            </div>
          </div>
        </div>

        <!-- Semantic Colors -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Semantic Colors</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <div *ngFor="let c of semanticColors" class="ds-color-chip" [style.background]="c.var">
              <span
                style="font-size:9px;font-weight:600;color:var(--ds-surface-ground);font-family:var(--ds-font-mono)"
                >{{ c.name }}</span
              >
              <span
                style="font-size:9px;color:var(--ds-surface-ground);font-family:var(--ds-font-mono);opacity:0.8"
                >{{ c.hex }}</span
              >
            </div>
          </div>
        </div>

        <!-- Trading Colors -->
        <div>
          <div class="ds-sub-heading">Trading Colors</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div
              style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--ds-overlay-positive-soft);border-radius:3px"
            >
              <span
                style="font-size:11px;font-weight:600;color:var(--ds-text-primary);font-family:var(--ds-font-mono)"
                >BUY +0.125</span
              >
              <span style="font-size:9px;color:rgba(255,255,255,0.7);font-family:var(--ds-font-mono)"
                >--ds-overlay-positive-soft</span
              >
            </div>
            <div
              style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--ds-overlay-negative-soft);border-radius:3px"
            >
              <span
                style="font-size:11px;font-weight:600;color:var(--ds-text-primary);font-family:var(--ds-font-mono)"
                >SELL -0.250</span
              >
              <span style="font-size:9px;color:rgba(255,255,255,0.7);font-family:var(--ds-font-mono)"
                >--ds-overlay-negative-soft</span
              >
            </div>
            <div
              style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--ds-accent-info);border-radius:3px"
            >
              <span
                style="font-size:11px;font-weight:600;color:var(--ds-text-primary);font-family:var(--ds-font-mono)"
                >SEND RFQ</span
              >
              <span style="font-size:9px;color:rgba(255,255,255,0.7);font-family:var(--ds-font-mono)"
                >--ds-text-primary</span
              >
            </div>
            <div
              style="display:flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--ds-accent-positive);border-radius:3px"
            >
              <span
                style="font-size:11px;font-weight:600;color:var(--ds-accent-positive);font-family:var(--ds-font-mono)"
                >+2.35%</span
              >
              <span style="font-size:9px;color:var(--ds-text-muted);font-family:var(--ds-font-mono)"
                >Positive</span
              >
            </div>
            <div
              style="display:flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--ds-accent-negative);border-radius:3px"
            >
              <span
                style="font-size:11px;font-weight:600;color:var(--ds-accent-negative);font-family:var(--ds-font-mono)"
                >-1.08%</span
              >
              <span style="font-size:9px;color:var(--ds-text-muted);font-family:var(--ds-font-mono)"
                >Negative</span
              >
            </div>
          </div>
        </div>
      </section>

      <div class="ds-divider"></div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 2. TYPOGRAPHY -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">2. Typography</div>

        <!-- Font Families -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Font Families</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div
              style="padding:10px 14px;background:var(--ds-surface-primary);border-radius:3px;border:1px solid var(--ds-border-primary)"
            >
              <span style="font-family:var(--ds-font-mono);font-size:13px;color:var(--ds-text-primary)"
                >JetBrains Mono</span
              >
              <span
                style="font-size:9px;color:var(--ds-text-muted);margin-left:8px;font-family:var(--ds-font-mono)"
                >--ds-font-mono / Data, prices, tables, code</span
              >
              <div
                style="font-family:var(--ds-font-mono);font-size:11px;color:var(--ds-text-secondary);margin-top:4px"
              >
                ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 $%+-.,:;
              </div>
            </div>
            <div
              style="padding:10px 14px;background:var(--ds-surface-primary);border-radius:3px;border:1px solid var(--ds-border-primary)"
            >
              <span style="font-family:var(--ds-font-sans);font-size:13px;color:var(--ds-text-primary)"
                >IBM Plex Sans</span
              >
              <span
                style="font-size:9px;color:var(--ds-text-muted);margin-left:8px;font-family:var(--ds-font-mono)"
                >--ds-font-sans / Headings, labels, UI chrome</span
              >
              <div
                style="font-family:var(--ds-font-sans);font-size:11px;color:var(--ds-text-secondary);margin-top:4px"
              >
                ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 $%+-.,:;
              </div>
            </div>
          </div>
        </div>

        <!-- Font Scale -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Font Scale</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div
              *ngFor="let f of fontScale"
              style="display:flex;align-items:baseline;gap:12px;padding:6px 14px;background:var(--ds-surface-primary);border-radius:3px;border:1px solid var(--ds-border-primary)"
            >
              <span
                style="font-family:var(--ds-font-mono);color:var(--ds-text-primary);font-weight:600"
                [style.fontSize]="f.size"
                >{{ f.sample }}</span
              >
              <span style="font-size:9px;color:var(--ds-text-muted);font-family:var(--ds-font-mono)"
                >{{ f.label }} ({{ f.size }})</span
              >
            </div>
          </div>
        </div>

        <!-- Font Weights -->
        <div>
          <div class="ds-sub-heading">Font Weights</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div
              *ngFor="let w of fontWeights"
              style="padding:8px 14px;background:var(--ds-surface-primary);border-radius:3px;border:1px solid var(--ds-border-primary)"
            >
              <span
                style="font-family:var(--ds-font-mono);font-size:13px;color:var(--ds-text-primary)"
                [style.fontWeight]="w.weight"
                >{{ w.label }}</span
              >
              <span
                style="font-size:9px;color:var(--ds-text-muted);font-family:var(--ds-font-mono);margin-left:6px"
                >{{ w.weight }}</span
              >
            </div>
          </div>
        </div>
      </section>

      <div class="ds-divider"></div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 3. SPACING & RADIUS -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">3. Spacing &amp; Radius</div>

        <!-- Spacing -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Spacing Scale</div>
          <div style="display:flex;align-items:flex-end;gap:6px;flex-wrap:wrap">
            <div
              *ngFor="let s of spacingScale"
              style="display:flex;flex-direction:column;align-items:center;gap:4px"
            >
              <div
                [style.width.px]="s.px"
                [style.height.px]="s.px"
                style="background:var(--ds-accent-info);border-radius:2px;min-width:4px;min-height:4px;opacity:0.7"
              ></div>
              <span style="font-size:9px;color:var(--ds-text-muted);font-family:var(--ds-font-mono)"
                >{{ s.px }}px</span
              >
              <span style="font-size:9px;color:var(--ds-text-faint);font-family:var(--ds-font-mono)">{{
                s.label
              }}</span>
            </div>
          </div>
        </div>

        <!-- Border Radius -->
        <div>
          <div class="ds-sub-heading">Border Radius</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <div
              *ngFor="let r of radiusScale"
              style="display:flex;flex-direction:column;align-items:center;gap:4px"
            >
              <div
                style="width:48px;height:48px;background:var(--ds-surface-tertiary);border:1px solid var(--ds-accent-info)"
                [style.borderRadius]="r.val"
              ></div>
              <span style="font-size:9px;color:var(--ds-text-muted);font-family:var(--ds-font-mono)">{{
                r.label
              }}</span>
              <span style="font-size:9px;color:var(--ds-text-faint);font-family:var(--ds-font-mono)">{{
                r.val
              }}</span>
            </div>
          </div>
        </div>
      </section>

      <div class="ds-divider"></div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 4. COMPONENT EXAMPLES -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">4. Component Examples</div>

        <!-- Buttons -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Buttons</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button class="ds-btn ds-btn-buy">BUY</button>
            <button class="ds-btn ds-btn-sell">SELL</button>
            <button class="ds-btn ds-btn-ghost">Cancel Order</button>
            <button class="ds-btn ds-btn-ghost" disabled>Disabled</button>
            <button class="ds-btn ds-btn-primary">Submit RFQ</button>
          </div>
        </div>

        <!-- Inputs -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Inputs</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
            <div style="display:flex;flex-direction:column;gap:3px">
              <label
                style="font-size:9px;color:var(--ds-text-muted);font-family:var(--ds-font-mono);text-transform:uppercase;letter-spacing:0.05em"
                >Price</label
              >
              <input type="text" value="99.875" readonly class="ds-input" style="width:120px" />
            </div>
            <div style="display:flex;flex-direction:column;gap:3px">
              <label
                style="font-size:9px;color:var(--ds-text-muted);font-family:var(--ds-font-mono);text-transform:uppercase;letter-spacing:0.05em"
                >Search</label
              >
              <input
                type="text"
                placeholder="Search bonds..."
                readonly
                class="ds-input"
                style="width:180px"
              />
            </div>
            <div style="display:flex;flex-direction:column;gap:3px">
              <label
                style="font-size:9px;color:var(--ds-text-muted);font-family:var(--ds-font-mono);text-transform:uppercase;letter-spacing:0.05em"
                >Quantity (MM)</label
              >
              <input type="text" value="5.000" readonly class="ds-input" style="width:120px" />
            </div>
          </div>
        </div>

        <!-- Status Badges -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Status Badges</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <span class="ds-badge" style="background:rgba(20,217,160,0.15);color:var(--ds-accent-positive)"
              >Filled</span
            >
            <span class="ds-badge" style="background:rgba(59,130,246,0.15);color:var(--ds-accent-info)"
              >Partial</span
            >
            <span class="ds-badge" style="background:rgba(255,140,66,0.15);color:var(--ds-accent-warning)"
              >Pending</span
            >
            <span class="ds-badge" style="background:rgba(255,77,109,0.15);color:var(--ds-accent-negative)"
              >Cancelled</span
            >
            <span class="ds-badge" style="background:rgba(0,188,212,0.15);color:var(--ds-accent-info)"
              >Working</span
            >
          </div>
        </div>

        <!-- Quote Type Badges -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Quote Type Badges (Order Book)</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
            <div *ngFor="let qt of quoteTypeBadges" style="display:flex;align-items:center;gap:8px">
              <span
                class="font-mono-fi"
                style="font-size:9px;font-weight:600;padding:1px 4px;border-radius:2px;letter-spacing:0.03em"
                [style.background]="qt.bg"
                [style.color]="qt.color"
                >{{ qt.label }}</span
              >
              <span style="font-size:9px;color:var(--ds-text-muted);font-family:var(--ds-font-mono)">{{
                qt.desc
              }}</span>
            </div>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Tab Navigation</div>
          <div style="display:flex;border-bottom:1px solid var(--ds-border-primary)">
            <div
              *ngFor="let tab of sampleTabs; let i = index"
              class="ds-tab"
              [class.ds-tab-active]="i === 0"
            >
              {{ tab }}
            </div>
          </div>
        </div>

        <!-- Panel / Card -->
        <div>
          <div class="ds-sub-heading">Panel / Card</div>
          <div
            style="background:var(--ds-surface-primary);border:1px solid var(--ds-border-primary);border-radius:4px;overflow:hidden;max-width:400px"
          >
            <div
              style="padding:8px 12px;border-bottom:1px solid var(--ds-border-primary);font-size:11px;color:var(--ds-text-secondary);font-family:var(--ds-font-mono);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:var(--ds-surface-secondary)"
            >
              Position Summary
            </div>
            <div style="padding:12px">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:11px;color:var(--ds-text-muted);font-family:var(--ds-font-mono)"
                  >Notional</span
                >
                <span
                  style="font-size:11px;color:var(--ds-text-primary);font-family:var(--ds-font-mono);font-weight:600"
                  >$25,000,000</span
                >
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:11px;color:var(--ds-text-muted);font-family:var(--ds-font-mono)"
                  >Avg Price</span
                >
                <span
                  style="font-size:11px;color:var(--ds-text-primary);font-family:var(--ds-font-mono);font-weight:600"
                  >99.750</span
                >
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="font-size:11px;color:var(--ds-text-muted);font-family:var(--ds-font-mono)"
                  >P&amp;L</span
                >
                <span
                  style="font-size:11px;color:var(--ds-accent-positive);font-family:var(--ds-font-mono);font-weight:600"
                  >+$42,500</span
                >
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="ds-divider"></div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 5. DATA DISPLAY -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">5. Data Display</div>

        <!-- Sample Table -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Bond Table</div>
          <div style="overflow-x:auto;border:1px solid var(--ds-border-primary);border-radius:4px">
            <table class="ds-table">
              <thead>
                <tr>
                  <th>Security</th>
                  <th>Coupon</th>
                  <th>Maturity</th>
                  <th>Bid</th>
                  <th>Ask</th>
                  <th>OAS</th>
                  <th>Chg</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of tableRows">
                  <td style="color:var(--ds-accent-info);font-weight:600">{{ row.security }}</td>
                  <td>{{ row.coupon }}</td>
                  <td>{{ row.maturity }}</td>
                  <td>{{ row.bid }}</td>
                  <td>{{ row.ask }}</td>
                  <td [style.color]="row.oasColor">{{ row.oas }}</td>
                  <td [style.color]="row.chgColor">{{ row.chg }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Order Book — FI Desk Layout -->
        <div>
          <div class="ds-sub-heading">
            Order Book — FI Desk (Dealer, Price, Yield, Face, DV01, Type)
          </div>
          <div
            style="max-width:560px;background:var(--ds-surface-primary);border:1px solid var(--ds-border-primary);border-radius:3px;overflow:hidden"
          >
            <!-- Instrument context bar -->
            <div
              style="display:flex;align-items:center;gap:12px;padding:6px 8px;border-bottom:1px solid var(--ds-border-primary);background:rgba(0,188,212,0.04)"
            >
              <span class="font-mono-fi" style="font-size:9px;font-weight:700;color:var(--ds-accent-info)"
                >UST 4.625 06/26</span
              >
              <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-muted)">US Treasury</span>
              <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-muted)"
                >CUSIP 912828ZT0</span
              >
              <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-secondary)">Aaa</span>
              <div style="margin-left:auto;display:flex;gap:12px">
                <span class="font-mono-fi" style="font-size:9px"
                  ><span style="color:var(--ds-text-muted)">OAS </span
                  ><span style="color:var(--ds-accent-warning);font-weight:600">+8</span></span
                >
                <span class="font-mono-fi" style="font-size:9px"
                  ><span style="color:var(--ds-text-muted)">DUR </span
                  ><span style="color:#3b82f6;font-weight:600">1.85</span></span
                >
              </div>
            </div>
            <!-- Column headers -->
            <div class="ob-grid-cols" style="display:grid;padding:4px 8px;background:var(--ds-surface-secondary)">
              <div class="col-hdr" style="text-align:left">Dealer</div>
              <div class="col-hdr" style="text-align:right">Price</div>
              <div class="col-hdr" style="text-align:right">Yield</div>
              <div class="col-hdr" style="text-align:right">Face (MM)</div>
              <div class="col-hdr" style="text-align:right">DV01 ($K)</div>
              <div class="col-hdr" style="text-align:center">Type</div>
            </div>
            <!-- Ask label + rows -->
            <div
              class="font-mono-fi"
              style="padding:2px 8px;font-size:9px;font-weight:700;color:var(--ds-accent-negative);letter-spacing:0.06em"
            >
              OFFERS (ASK)
            </div>
            <div
              *ngFor="let r of dsAskRows"
              class="ob-grid-cols"
              style="display:grid;padding:2px 8px;position:relative"
            >
              <div class="ds-ob-bar-ask" [style.width.%]="r.fill"></div>
              <span
                class="font-mono-fi"
                style="font-size:11px;color:var(--ds-text-secondary);position:relative;z-index:1"
                >{{ r.dealer }}</span
              >
              <span
                class="font-mono-fi"
                style="font-size:11px;color:var(--ds-accent-negative);text-align:right;position:relative;z-index:1"
                >{{ r.price }}</span
              >
              <span
                class="font-mono-fi"
                style="font-size:11px;color:var(--ds-text-primary);text-align:right;position:relative;z-index:1"
                >{{ r.yld }}</span
              >
              <span
                class="font-mono-fi"
                style="font-size:11px;color:var(--ds-text-primary);text-align:right;position:relative;z-index:1"
                >{{ r.face }}</span
              >
              <span
                class="font-mono-fi"
                style="font-size:11px;color:#3b82f6;text-align:right;position:relative;z-index:1"
                >{{ r.dv01 }}</span
              >
              <span style="text-align:center;position:relative;z-index:1">
                <span
                  class="font-mono-fi"
                  style="font-size:9px;font-weight:600;padding:1px 4px;border-radius:2px;letter-spacing:0.03em"
                  [style.background]="qtBadgeBg(r.type)"
                  [style.color]="qtBadgeColor(r.type)"
                  >{{ r.type }}</span
                >
              </span>
            </div>
            <!-- Spread bar -->
            <div
              style="display:flex;align-items:center;padding:6px 8px;border-top:1px solid var(--ds-border-primary);border-bottom:1px solid var(--ds-border-primary);background:linear-gradient(90deg, rgba(20,217,160,0.08), var(--ds-surface-secondary), rgba(255,77,109,0.08))"
            >
              <span
                class="font-mono-fi"
                style="font-size:11px;font-weight:700;color:var(--ds-accent-positive)"
                >100.135</span
              >
              <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-muted);margin-left:12px"
                >≈ $100.135</span
              >
              <div style="margin-left:auto;display:flex;gap:16px">
                <span class="font-mono-fi" style="font-size:9px"
                  ><span style="color:var(--ds-text-muted)">Spread </span
                  ><span style="color:var(--ds-accent-warning);font-weight:600">0.125</span></span
                >
                <span class="font-mono-fi" style="font-size:9px"
                  ><span style="color:var(--ds-text-muted)">Mid Yld </span
                  ><span style="color:#22d3ee;font-weight:600">4.520</span></span
                >
                <span class="font-mono-fi" style="font-size:9px"
                  ><span style="color:var(--ds-text-muted)">Z-Spd </span
                  ><span style="color:#a855f7;font-weight:600">8</span></span
                >
              </div>
            </div>
            <!-- Bid label + rows -->
            <div
              class="font-mono-fi"
              style="padding:2px 8px;font-size:9px;font-weight:700;color:var(--ds-accent-positive);letter-spacing:0.06em"
            >
              BIDS
            </div>
            <div
              *ngFor="let r of dsBidRows"
              class="ob-grid-cols"
              style="display:grid;padding:2px 8px;position:relative"
            >
              <div class="ds-ob-bar-bid" [style.width.%]="r.fill"></div>
              <span
                class="font-mono-fi"
                style="font-size:11px;color:var(--ds-text-secondary);position:relative;z-index:1"
                >{{ r.dealer }}</span
              >
              <span
                class="font-mono-fi"
                style="font-size:11px;color:var(--ds-accent-positive);text-align:right;position:relative;z-index:1"
                >{{ r.price }}</span
              >
              <span
                class="font-mono-fi"
                style="font-size:11px;color:var(--ds-text-primary);text-align:right;position:relative;z-index:1"
                >{{ r.yld }}</span
              >
              <span
                class="font-mono-fi"
                style="font-size:11px;color:var(--ds-text-primary);text-align:right;position:relative;z-index:1"
                >{{ r.face }}</span
              >
              <span
                class="font-mono-fi"
                style="font-size:11px;color:#3b82f6;text-align:right;position:relative;z-index:1"
                >{{ r.dv01 }}</span
              >
              <span style="text-align:center;position:relative;z-index:1">
                <span
                  class="font-mono-fi"
                  style="font-size:9px;font-weight:600;padding:1px 4px;border-radius:2px;letter-spacing:0.03em"
                  [style.background]="qtBadgeBg(r.type)"
                  [style.color]="qtBadgeColor(r.type)"
                  >{{ r.type }}</span
                >
              </span>
            </div>
            <!-- Aggregate footer -->
            <div
              style="display:flex;align-items:center;padding:6px 8px;border-top:1px solid var(--ds-border-primary);background:var(--ds-surface-secondary)"
            >
              <div style="display:flex;gap:16px">
                <span class="font-mono-fi" style="font-size:9px"
                  ><span style="color:var(--ds-text-muted)">BID DV01 </span
                  ><span style="color:var(--ds-accent-positive);font-weight:600">$16.3K</span></span
                >
                <span class="font-mono-fi" style="font-size:9px"
                  ><span style="color:var(--ds-text-muted)">ASK DV01 </span
                  ><span style="color:var(--ds-accent-negative);font-weight:600">$20.9K</span></span
                >
              </div>
              <div style="margin-left:auto;display:flex;gap:16px">
                <span class="font-mono-fi" style="font-size:9px"
                  ><span style="color:var(--ds-text-muted)">MIN SIZE </span
                  ><span style="color:var(--ds-text-secondary);font-weight:600">1.5MM</span></span
                >
                <span class="font-mono-fi" style="font-size:9px"
                  ><span style="color:var(--ds-text-muted)">FIRM </span
                  ><span style="color:var(--ds-accent-positive);font-weight:600">4</span></span
                >
                <span class="font-mono-fi" style="font-size:9px"
                  ><span style="color:var(--ds-text-muted)">SETTLE </span
                  ><span style="color:var(--ds-text-secondary);font-weight:600">T+1</span></span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Instrument Context Bar -->
        <div style="margin-top:20px">
          <div class="ds-sub-heading">Instrument Context Bar</div>
          <div style="font-size:9px;color:var(--ds-text-muted);margin-bottom:8px">
            Appears atop Order Book and Trade Ticket. Shows bond identity, CUSIP, rating, and live
            analytics.
          </div>
          <div
            style="max-width:560px;display:flex;align-items:center;gap:12px;padding:6px 12px;background:rgba(0,188,212,0.04);border:1px solid var(--ds-border-primary);border-radius:3px"
          >
            <span class="font-mono-fi" style="font-size:9px;font-weight:700;color:var(--ds-accent-info)"
              >AAPL 3.25 02/29</span
            >
            <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-muted)">Apple Inc</span>
            <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-muted)"
              >CUSIP 037833DV8</span
            >
            <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-secondary)">Aa1</span>
            <div style="margin-left:auto;display:flex;gap:12px">
              <span class="font-mono-fi" style="font-size:9px"
                ><span style="color:var(--ds-text-muted)">OAS </span
                ><span style="color:var(--ds-accent-warning);font-weight:600">+65</span></span
              >
              <span class="font-mono-fi" style="font-size:9px"
                ><span style="color:var(--ds-text-muted)">DUR </span
                ><span style="color:#3b82f6;font-weight:600">2.68</span></span
              >
            </div>
          </div>
        </div>

        <!-- Countdown Ring -->
        <div style="margin-top:20px">
          <div class="ds-sub-heading">Countdown Ring (RFQ TTL)</div>
          <div style="font-size:9px;color:var(--ds-text-muted);margin-bottom:8px">
            SVG ring depletes over 30s TTL. Color transitions: blue (safe) → amber (warning &lt;10s)
            → red (expiring &lt;5s).
          </div>
          <div style="display:flex;gap:24px;align-items:center">
            <div *ngFor="let r of countdownRings" style="display:flex;align-items:center;gap:8px">
              <svg [attr.width]="28" [attr.height]="28" viewBox="0 0 28 28">
                <circle
                  cx="14"
                  cy="14"
                  r="12"
                  fill="none"
                  stroke="var(--ds-surface-secondary)"
                  stroke-width="2.5"
                />
                <circle
                  cx="14"
                  cy="14"
                  r="12"
                  fill="none"
                  [attr.stroke]="r.color"
                  stroke-width="2.5"
                  [attr.stroke-dasharray]="r.dash"
                  stroke-dashoffset="18.85"
                  stroke-linecap="round"
                  style="transform:rotate(-90deg);transform-origin:center"
                />
                <text
                  x="14"
                  y="14"
                  text-anchor="middle"
                  dominant-baseline="central"
                  [attr.fill]="r.color"
                  style="font-size:9px;font-family:var(--ds-font-mono);font-weight:600"
                >
                  {{ r.secs }}
                </text>
              </svg>
              <span class="font-mono-fi" style="font-size:9px;color:var(--ds-text-muted)">{{
                r.label
              }}</span>
            </div>
          </div>
        </div>
      </section>

      <div class="ds-divider"></div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 6. AG GRID CELL RENDERERS -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">6. AG Grid Cell Renderers</div>
        <div style="font-size:11px;color:var(--ds-text-muted);margin-bottom:16px">
          Shared vanilla TypeScript cell renderers from design-system/cell-renderers.ts.
          Framework-agnostic — used in both React and Angular apps via ICellRendererComp.
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          @for (r of cellRenderers; track r.name) {
            <div
              style="background:var(--ds-surface-primary);border:1px solid var(--ds-border-primary);border-radius:3px;padding:8px 12px"
            >
              <div
                style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"
              >
                <span
                  style="font-size:11px;font-weight:600;color:var(--ds-text-primary);font-family:var(--ds-font-mono)"
                  >{{ r.name }}</span
                >
                <span
                  [style.color]="r.color"
                  style="font-size:11px;font-weight:700;font-family:var(--ds-font-mono)"
                  >{{ r.example }}</span
                >
              </div>
              <span style="font-size:9px;color:var(--ds-text-muted)">{{ r.desc }}</span>
            </div>
          }
        </div>

        <div class="ds-sub-heading" style="margin-top:16px">Usage</div>
        <pre class="ds-code">{{ cellRendererUsageCode }}</pre>
      </section>

      <div class="ds-divider"></div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 7. ANGULAR USAGE GUIDE -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">7. Angular Usage Guide</div>

        <!-- PrimeNG Preset -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">PrimeNG Preset Setup</div>
          <pre class="ds-code">{{ primengCode }}</pre>
        </div>

        <!-- AG Grid Theming -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">AG Grid Theming</div>
          <pre class="ds-code">{{ agGridCode }}</pre>
        </div>

        <!-- CSS Variable Usage -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">CSS Variable Usage</div>
          <pre class="ds-code">{{ cssVarCode }}</pre>
        </div>

        <!-- Dark/Light Toggle -->
        <div>
          <div class="ds-sub-heading">Dark / Light Toggle</div>
          <pre class="ds-code">{{ themeToggleCode }}</pre>
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        background: var(--ds-surface-ground);
        scrollbar-width: thin;
        scrollbar-color: var(--scrollbar-thumb) transparent;
      }
      .ds-section-heading {
        font-size: 13px;
        font-weight: 700;
        color: var(--ds-text-primary);
        font-family: var(--ds-font-sans);
        margin-bottom: 16px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--ds-border-primary);
      }
      .ds-sub-heading {
        font-size: 11px;
        font-weight: 600;
        color: var(--ds-text-secondary);
        font-family: var(--ds-font-mono);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .ds-divider {
        height: 1px;
        background: var(--ds-border-primary);
        margin-bottom: 32px;
      }
      .ds-swatch {
        width: 100px;
        height: 64px;
        border-radius: 4px;
        border: 1px solid var(--ds-border-primary);
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding: 6px 8px;
      }
      .ds-swatch-label {
        font-size: 9px;
        color: var(--ds-text-secondary);
        font-family: var(--ds-font-mono);
      }
      .ds-swatch-hex {
        font-size: 9px;
        color: var(--ds-text-muted);
        font-family: var(--ds-font-mono);
      }
      .ds-color-chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 8px 14px;
        border-radius: 3px;
        min-width: 80px;
      }
      .ds-btn {
        font-family: var(--ds-font-mono);
        font-size: 11px;
        font-weight: 600;
        padding: 6px 16px;
        border-radius: 3px;
        border: none;
        cursor: pointer;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .ds-btn-buy {
        background: var(--ds-overlay-positive-soft);
        color: #fff;
      }
      .ds-btn-sell {
        background: var(--ds-overlay-negative-soft);
        color: #fff;
      }
      .ds-btn-ghost {
        background: transparent;
        color: var(--ds-text-secondary);
        border: 1px solid var(--ds-border-secondary);
      }
      .ds-btn-ghost:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .ds-btn-primary {
        background: var(--ds-accent-info);
        color: #ffffff;
      }
      .ds-input {
        font-family: var(--ds-font-mono);
        font-size: 11px;
        color: var(--ds-text-primary);
        background: var(--ds-surface-ground);
        border: 1px solid var(--ds-border-secondary);
        border-radius: 3px;
        padding: 6px 10px;
        outline: none;
        font-variant-numeric: tabular-nums;
      }
      .ds-badge {
        font-family: var(--ds-font-mono);
        font-size: 9px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 3px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .ds-tab {
        font-family: var(--ds-font-mono);
        font-size: 11px;
        color: var(--ds-text-muted);
        padding: 8px 14px;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        font-weight: 500;
      }
      .ds-tab-active {
        color: var(--ds-text-primary);
        border-bottom-color: var(--ds-accent-info);
        font-weight: 600;
      }
      .ds-table {
        width: 100%;
        border-collapse: collapse;
        font-family: var(--ds-font-mono);
        font-size: 11px;
      }
      .ds-table th {
        font-size: 9px;
        color: var(--ds-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
        text-align: left;
        padding: 6px 12px;
        background: var(--ds-surface-secondary);
        border-bottom: 1px solid var(--ds-border-primary);
      }
      .ds-table td {
        padding: 6px 12px;
        color: var(--ds-text-primary);
        border-bottom: 1px solid var(--ds-border-primary);
        font-variant-numeric: tabular-nums;
      }
      .ds-table tr:hover td {
        background: var(--ds-surface-secondary);
      }
      .ds-ob-bar-bid {
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        background: rgba(45, 212, 191, 0.08);
      }
      .ds-ob-bar-ask {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        background: rgba(248, 113, 113, 0.08);
      }
      .ds-code {
        font-family: var(--ds-font-mono);
        font-size: 11px;
        color: var(--ds-text-secondary);
        background: var(--ds-surface-primary);
        border: 1px solid var(--ds-border-primary);
        border-radius: 4px;
        padding: 12px 16px;
        margin: 0;
        overflow-x: auto;
        white-space: pre;
        line-height: 1.5;
        scrollbar-width: thin;
        scrollbar-color: var(--scrollbar-thumb) transparent;
      }
    `,
  ],
})
export class DesignSystemWidget {
  @Input() api: any;
  @Input() panel: any;

  // ── 1. Color Palette data ──
  // Hex values show Dark / Light (VS Code Light Modern) pairs
  surfaceColors = [
    { name: '--ds-surface-ground', hex: 'D:#0a0e14 L:#f3f5f9', var: 'var(--ds-surface-ground)' },
    { name: '--ds-surface-primary', hex: 'D:#121820 L:#fbfcfd', var: 'var(--ds-surface-primary)' },
    { name: '--ds-surface-secondary', hex: 'D:#1a212b L:#ebeef3', var: 'var(--ds-surface-secondary)' },
    { name: '--ds-surface-tertiary', hex: 'D:#242c38 L:#dde2ea', var: 'var(--ds-surface-tertiary)' },
  ];

  textColors = [
    { name: '--ds-text-primary', hex: 'D:#e6e9ef L:#1a1f2e', var: 'var(--ds-text-primary)' },
    { name: '--ds-text-secondary', hex: 'D:#a7b0bd L:#4f5665', var: 'var(--ds-text-secondary)' },
    { name: '--ds-text-muted', hex: 'D:#6b7280 L:#6b7280', var: 'var(--ds-text-muted)' },
    { name: '--ds-text-faint', hex: 'D:#4d586a L:#9ca3af', var: 'var(--ds-text-faint)' },
  ];

  semanticColors = [
    { name: 'Green (Buy)', hex: 'D:#14d9a0 L:#0ea870', var: 'var(--ds-accent-positive)' },
    { name: 'Red (Sell)', hex: 'D:#ff4d6d L:#e02e47', var: 'var(--ds-accent-negative)' },
    { name: 'Orange (Warn)', hex: 'D:#ff8c42 L:#e86a1c', var: 'var(--ds-accent-warning)' },
    { name: 'Blue (Brand)', hex: 'D:#3b82f6 L:#2563eb', var: 'var(--ds-accent-info)' },
    { name: 'Cyan (HL)', hex: 'D:#22d3ee L:#06b6d4', var: 'var(--ds-accent-info)' },
    { name: 'Purple', hex: 'D:#a855f7 L:#7c3aed', var: 'var(--ds-accent-info)' },
  ];

  // ── 2. Typography data ──
  fontScale = [
    { label: 'xs', size: '9px (10px light)', sample: 'Column Header / Caption' },
    { label: 'sm', size: '11px', sample: 'Body text, table cells, data values (default)' },
    { label: 'md', size: '13px', sample: 'Section titles, nav tabs, CTA buttons' },
    { label: 'lg', size: '18px', sample: 'KPI headline numbers' },
  ];

  fontWeights = [
    { label: 'Regular', weight: 400 },
    { label: 'Medium', weight: 500 },
    { label: 'SemiBold', weight: 600 },
    { label: 'Bold', weight: 700 },
  ];

  // ── 3. Spacing & Radius data ──
  spacingScale = [
    { label: '0.5', px: 2 },
    { label: '1', px: 4 },
    { label: '1.5', px: 6 },
    { label: '2', px: 8 },
    { label: '3', px: 12 },
    { label: '4', px: 16 },
    { label: '5', px: 20 },
    { label: '6', px: 24 },
    { label: '8', px: 32 },
  ];

  radiusScale = [
    { label: 'none', val: '0px' },
    { label: 'sm', val: '2px' },
    { label: 'md', val: '3px' },
    { label: 'lg', val: '4px' },
    { label: 'xl', val: '6px' },
    { label: 'full', val: '9999px' },
  ];

  // ── 4. Component data ──
  sampleTabs = ['Prices', 'Trade', 'Risk', 'Market', 'Orders'];

  // ── 5. Data display ──
  tableRows = [
    {
      security: 'T 4.500 11/30',
      coupon: '4.500%',
      maturity: '2030-11-30',
      bid: '99.875',
      ask: '99.938',
      oas: '+42bp',
      oasColor: 'var(--ds-accent-positive)',
      chg: '+0.125',
      chgColor: 'var(--ds-accent-positive)',
    },
    {
      security: 'T 3.875 08/31',
      coupon: '3.875%',
      maturity: '2031-08-15',
      bid: '97.250',
      ask: '97.375',
      oas: '+58bp',
      oasColor: 'var(--ds-accent-positive)',
      chg: '-0.063',
      chgColor: 'var(--ds-accent-negative)',
    },
    {
      security: 'T 5.000 05/34',
      coupon: '5.000%',
      maturity: '2034-05-15',
      bid: '102.500',
      ask: '102.625',
      oas: '+85bp',
      oasColor: 'var(--ds-accent-warning)',
      chg: '+0.250',
      chgColor: 'var(--ds-accent-positive)',
    },
    {
      security: 'T 4.250 02/29',
      coupon: '4.250%',
      maturity: '2029-02-28',
      bid: '100.125',
      ask: '100.188',
      oas: '+31bp',
      oasColor: 'var(--ds-accent-positive)',
      chg: '-0.188',
      chgColor: 'var(--ds-accent-negative)',
    },
  ];

  // Quote type badges
  quoteTypeBadges = [
    {
      label: 'STREAM',
      bg: 'rgba(20,217,160,0.12)',
      color: 'var(--ds-accent-positive)',
      desc: 'Firm / executable',
    },
    {
      label: 'RFQ',
      bg: 'rgba(59,130,246,0.12)',
      color: 'var(--ds-accent-info)',
      desc: 'Request for quote',
    },
    {
      label: 'IND',
      bg: 'rgba(255,140,66,0.12)',
      color: 'var(--ds-accent-warning)',
      desc: 'Indicative only',
    },
  ];

  qtBadgeBg(type: string) {
    return type === 'STREAM'
      ? 'rgba(20,217,160,0.12)'
      : type === 'RFQ'
        ? 'rgba(59,130,246,0.12)'
        : 'rgba(255,140,66,0.12)';
  }
  qtBadgeColor(type: string) {
    return type === 'STREAM'
      ? 'var(--ds-accent-positive)'
      : type === 'RFQ'
        ? 'var(--ds-accent-info)'
        : 'var(--ds-accent-warning)';
  }

  // Order book sample data (FI desk layout)
  dsAskRows = [
    {
      dealer: 'BARC',
      price: '100.247',
      yld: '4.496',
      face: '2.5',
      dv01: '4.6',
      type: 'IND',
      fill: 35,
    },
    {
      dealer: 'GS',
      price: '100.222',
      yld: '4.504',
      face: '3.8',
      dv01: '7.0',
      type: 'STREAM',
      fill: 70,
    },
    {
      dealer: 'JPM',
      price: '100.197',
      yld: '4.512',
      face: '5.0',
      dv01: '9.3',
      type: 'STREAM',
      fill: 100,
    },
  ];
  dsBidRows = [
    {
      dealer: 'MS',
      price: '100.072',
      yld: '4.528',
      face: '4.5',
      dv01: '8.3',
      type: 'STREAM',
      fill: 90,
    },
    {
      dealer: 'CITI',
      price: '100.050',
      yld: '4.536',
      face: '2.8',
      dv01: '5.2',
      type: 'RFQ',
      fill: 56,
    },
    {
      dealer: 'DB',
      price: '100.031',
      yld: '4.544',
      face: '1.5',
      dv01: '2.8',
      type: 'STREAM',
      fill: 30,
    },
  ];

  // Countdown ring examples
  countdownRings = [
    { secs: 25, color: '#3da0ff', dash: '69 75.4', label: '25s — blue (safe)' },
    { secs: 8, color: '#ff8c42', dash: '20 75.4', label: '8s — amber (warning)' },
    { secs: 3, color: 'var(--ds-accent-negative)', dash: '7.5 75.4', label: '3s — red (expiring)' },
  ];

  // ── 6. Code snippets ──
  primengCode = `// app.config.ts
import { providePrimeNG } from 'primeng/config';
import { definePreset } from 'primeng/api';
import { Aura } from 'primeng/themes';
import { generatePrimeNGPreset } from '@fi/design-system/adapters/primeng';

const FiTheme = definePreset(Aura, generatePrimeNGPreset());

export const appConfig = {
  providers: [
    providePrimeNG({
      theme: {
        preset: FiTheme,
        options: {
          darkModeSelector: '[data-theme="dark"]',
        },
      },
    }),
  ],
};`;

  agGridCode = `// In your component
import { themeQuartz } from 'ag-grid-community';
import { agGridDarkParams, agGridLightParams }
  from '@fi/design-system/adapters/ag-grid';

// Create themes from the design system params
const darkTheme  = themeQuartz.withParams(agGridDarkParams);
const lightTheme = themeQuartz.withParams(agGridLightParams);

// Bind in template:
// <ag-grid-angular [theme]="gridTheme" ... />

// Toggle with data-theme attribute:
get gridTheme() {
  const isDark = document.documentElement
    .getAttribute('data-theme') === 'dark';
  return isDark ? darkTheme : lightTheme;
}`;

  cssVarCode = `/* Use CSS variables directly in styles */
.panel-header {
  background: var(--ds-surface-secondary);
  color: var(--ds-text-secondary);
  font-family: var(--ds-font-mono);
  font-size: var(--ds-font-size-xs);
  border-bottom: 1px solid var(--ds-border-primary);
}

.price-positive { color: var(--ds-accent-positive); }
.price-negative { color: var(--ds-accent-negative); }
.kpi-value {
  font-size: var(--ds-font-size-2xl);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}`;

  themeToggleCode = `// In your Angular component
import { signal, effect } from '@angular/core';

isDark = signal(true);

constructor() {
  effect(() => {
    const mode = this.isDark() ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode);
    // AG Grid reads this attribute
    document.body.dataset['agThemeMode'] = mode;
  });
}

toggleTheme() {
  this.isDark.update(v => !v);
}

// Template:
// <button (click)="toggleTheme()">
//   {{ isDark() ? 'Light' : 'Dark' }}
// </button>`;

  // ── 6. Cell Renderers data ──
  cellRenderers = [
    {
      name: 'SideCellRenderer',
      desc: 'BUY / SELL with green / red color',
      example: 'BUY',
      color: 'var(--ds-accent-positive)',
    },
    {
      name: 'StatusBadgeRenderer',
      desc: 'Filled, Partial, Pending, Cancelled',
      example: 'FILLED',
      color: 'var(--ds-accent-positive)',
    },
    {
      name: 'ColoredValueRenderer',
      desc: 'Positive green, negative red',
      example: '+0.125',
      color: 'var(--ds-accent-positive)',
    },
    {
      name: 'OasValueRenderer',
      desc: 'OAS with warning threshold >80',
      example: '+42',
      color: 'var(--ds-accent-positive)',
    },
    {
      name: 'SignedValueRenderer',
      desc: 'Signed spread values',
      example: '+3.2',
      color: 'var(--ds-text-secondary)',
    },
    {
      name: 'TickerCellRenderer',
      desc: 'Cyan bold ticker symbol',
      example: 'UST',
      color: 'var(--ds-accent-info)',
    },
    {
      name: 'RatingBadgeRenderer',
      desc: 'Credit rating badge (Aaa-HY)',
      example: 'Aa2',
      color: 'var(--ds-accent-positive)',
    },
    {
      name: 'PnlValueRenderer',
      desc: 'P&L with K suffix',
      example: '+120K',
      color: 'var(--ds-accent-positive)',
    },
    {
      name: 'FilledAmountRenderer',
      desc: 'Green if full, yellow if partial',
      example: '5000',
      color: 'var(--ds-accent-warning)',
    },
    {
      name: 'BookNameRenderer',
      desc: 'Cyan book/desk name',
      example: 'IG-NYC',
      color: 'var(--ds-accent-info)',
    },
    {
      name: 'ChangeValueRenderer',
      desc: 'Market index change',
      example: '+0.45',
      color: 'var(--ds-accent-positive)',
    },
    {
      name: 'RfqStatusRenderer',
      desc: 'LIVE / DONE / STALE badge',
      example: 'LIVE',
      color: 'var(--ds-accent-info)',
    },
  ];

  cellRendererUsageCode = `import { SideCellRenderer, StatusBadgeRenderer }
  from '../services/cell-renderers';

colDefs: ColDef[] = [
  { field: 'side',   cellRenderer: SideCellRenderer },
  { field: 'status', cellRenderer: StatusBadgeRenderer },
];`;
}

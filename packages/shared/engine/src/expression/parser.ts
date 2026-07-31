import type { Token, ExpressionNode } from './types';

/**
 * Pratt parser (precedence climbing) for expression language.
 * Handles operator precedence correctly without nested if/else chains.
 */
export class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ExpressionNode {
    const node = this.parseExpression(0);
    if (this.peek().type !== 'EOF') {
      throw new SyntaxError(`Unexpected token '${this.peek().value}' at position ${this.peek().position}`);
    }
    return node;
  }

  private parseExpression(minPrec: number): ExpressionNode {
    let left = this.parseUnary();

    while (true) {
      const token = this.peek();

      // Ternary
      if (token.type === 'QUESTION' && minPrec <= 1) {
        this.advance();
        const consequent = this.parseExpression(0);
        this.expect('COLON');
        const alternate = this.parseExpression(1);
        left = { type: 'ternary', condition: left, consequent, alternate };
        continue;
      }

      // Logical OR
      if (token.type === 'LOGICAL' && token.value === 'OR' && minPrec <= 2) {
        this.advance();
        const right = this.parseExpression(3);
        left = { type: 'binary', operator: 'OR', left, right };
        continue;
      }

      // Logical AND
      if (token.type === 'LOGICAL' && token.value === 'AND' && minPrec <= 4) {
        this.advance();
        const right = this.parseExpression(5);
        left = { type: 'binary', operator: 'AND', left, right };
        continue;
      }

      // Comparison
      if (token.type === 'COMPARISON' && minPrec <= 6) {
        this.advance();
        // Special: IN [list]
        if (token.value === 'IN') {
          this.expect('LBRACKET');
          const elements: ExpressionNode[] = [];
          while (this.peek().type !== 'RBRACKET') {
            if (elements.length > 0) this.expect('COMMA');
            elements.push(this.parseExpression(0));
          }
          this.expect('RBRACKET');
          left = { type: 'binary', operator: 'IN', left, right: { type: 'array', elements } };
          continue;
        }
        // Special: BETWEEN a AND b
        if (token.value === 'BETWEEN') {
          const low = this.parseExpression(7);
          this.expectKeyword('AND');
          const high = this.parseExpression(7);
          left = {
            type: 'binary',
            operator: 'BETWEEN',
            left,
            right: { type: 'array', elements: [low, high] },
          };
          continue;
        }
        const right = this.parseExpression(7);
        left = { type: 'binary', operator: token.value, left, right };
        continue;
      }

      // Addition/Subtraction
      if (token.type === 'OPERATOR' && (token.value === '+' || token.value === '-') && minPrec <= 8) {
        this.advance();
        const right = this.parseExpression(9);
        left = { type: 'binary', operator: token.value, left, right };
        continue;
      }

      // Multiplication/Division/Modulus
      if (token.type === 'OPERATOR' && (token.value === '*' || token.value === '/' || token.value === '%') && minPrec <= 10) {
        this.advance();
        const right = this.parseExpression(11);
        left = { type: 'binary', operator: token.value, left, right };
        continue;
      }

      // Member access (dot)
      if (token.type === 'DOT' && minPrec <= 14) {
        this.advance();
        const prop = this.expect('IDENTIFIER');
        left = { type: 'member', object: left, property: prop.value };
        continue;
      }

      break;
    }

    return left;
  }

  private parseUnary(): ExpressionNode {
    const token = this.peek();

    // Unary NOT
    if (token.type === 'LOGICAL' && token.value === 'NOT') {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'unary', operator: 'NOT', operand };
    }

    // Unary minus
    if (token.type === 'OPERATOR' && token.value === '-') {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'unary', operator: '-', operand };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const token = this.peek();

    // Parenthesized expression
    if (token.type === 'LPAREN') {
      this.advance();
      const expr = this.parseExpression(0);
      this.expect('RPAREN');
      return expr;
    }

    // Number literal
    if (token.type === 'NUMBER') {
      this.advance();
      return { type: 'literal', value: Number(token.value) };
    }

    // String literal
    if (token.type === 'STRING') {
      this.advance();
      return { type: 'literal', value: token.value };
    }

    // Boolean literal
    if (token.type === 'BOOLEAN') {
      this.advance();
      return { type: 'literal', value: token.value === 'true' };
    }

    // Null literal
    if (token.type === 'NULL') {
      this.advance();
      return { type: 'literal', value: null };
    }

    // Column reference
    if (token.type === 'COLUMN_REF') {
      this.advance();
      return { type: 'columnRef', columnId: token.value };
    }

    const bracketedColumnRef = this.tryParseBracketedColumnRef();
    if (bracketedColumnRef) return bracketedColumnRef;

    // Array literal
    if (token.type === 'LBRACKET') {
      this.advance();
      const elements: ExpressionNode[] = [];
      while (this.peek().type !== 'RBRACKET') {
        if (elements.length > 0) this.expect('COMMA');
        elements.push(this.parseExpression(0));
      }
      this.expect('RBRACKET');
      return { type: 'array', elements };
    }

    // Identifier — variable, function call, or a CASE / if conditional form.
    if (token.type === 'IDENTIFIER') {
      const lower = token.value.toLowerCase();

      // Searched CASE: `CASE WHEN cond THEN result [WHEN …] [ELSE result] END`.
      // Sugar that folds into nested ternaries (short-circuiting). The legacy
      // value-switch `CASE(expr, …)` function is kept — it's followed by `(`,
      // this form by `WHEN`.
      if (lower === 'case' && this.peekIsIdent('when', 1)) {
        this.advance(); // CASE
        return this.parseSearchedCase();
      }

      // Block form: `if (cond) { … } [else if (…) {…}] [else {…}]`. Sugar that
      // folds into ternaries. Distinguished from the `IF(cond, then, else)`
      // function by the `{` after the `)` — otherwise we rewind and let the
      // normal function-call path handle `IF(...)`.
      if (lower === 'if' && this.tokens[this.pos + 1]?.type === 'LPAREN') {
        const save = this.pos;
        this.advance(); // if
        this.advance(); // (
        const cond = this.parseExpression(0);
        if (this.peek().type === 'RPAREN' && this.tokens[this.pos + 1]?.type === 'LBRACE') {
          this.advance(); // )
          return this.parseIfBlock(cond);
        }
        this.pos = save; // not a block → fall through to IF(...) function call
      }

      this.advance();
      // Function call
      if (this.peek().type === 'LPAREN') {
        this.advance();
        const args: ExpressionNode[] = [];
        while (this.peek().type !== 'RPAREN') {
          if (args.length > 0) this.expect('COMMA');
          args.push(this.parseExpression(0));
        }
        this.expect('RPAREN');
        return { type: 'call', name: token.value, args };
      }
      // Variable
      return { type: 'variable', name: token.value };
    }

    throw new SyntaxError(`Unexpected token '${token.value}' at position ${token.position}`);
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: 'EOF', value: '', position: -1 };
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: string): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new SyntaxError(`Expected ${type} but got '${token.value}' at position ${token.position}`);
    }
    return this.advance();
  }

  private expectKeyword(keyword: string): Token {
    const token = this.peek();
    if (token.value !== keyword) {
      throw new SyntaxError(`Expected '${keyword}' but got '${token.value}' at position ${token.position}`);
    }
    return this.advance();
  }

  /**
   * True when the token at `offset` from the cursor is an identifier equal to
   * `word` (case-insensitive). Used for the contextual keywords WHEN / THEN /
   * ELSE / END / RETURN — they're only special inside CASE / if forms, so a
   * column named `end` (bracketed `[end]` or bare) keeps working elsewhere.
   */
  private peekIsIdent(word: string, offset = 0): boolean {
    const t = this.tokens[this.pos + offset];
    return t?.type === 'IDENTIFIER' && t.value.toLowerCase() === word;
  }

  private expectIdent(word: string): Token {
    if (!this.peekIsIdent(word)) {
      const t = this.peek();
      throw new SyntaxError(`Expected '${word.toUpperCase()}' but got '${t.value}' at position ${t.position}`);
    }
    return this.advance();
  }

  /** Fold ordered (cond, result) branches + an else into nested ternaries. */
  private foldBranches(
    branches: ReadonlyArray<{ cond: ExpressionNode; result: ExpressionNode }>,
    alternate: ExpressionNode,
  ): ExpressionNode {
    let node = alternate;
    for (let i = branches.length - 1; i >= 0; i--) {
      node = {
        type: 'ternary',
        condition: branches[i].cond,
        consequent: branches[i].result,
        alternate: node,
      };
    }
    return node;
  }

  /** `CASE` already consumed → parse `WHEN cond THEN result … [ELSE r] END`. */
  private parseSearchedCase(): ExpressionNode {
    const branches: { cond: ExpressionNode; result: ExpressionNode }[] = [];
    while (this.peekIsIdent('when')) {
      this.advance(); // WHEN
      const cond = this.parseExpression(0);
      this.expectIdent('then');
      const result = this.parseExpression(0);
      branches.push({ cond, result });
    }
    if (branches.length === 0) {
      const t = this.peek();
      throw new SyntaxError(`CASE requires at least one WHEN at position ${t.position}`);
    }
    let alternate: ExpressionNode = { type: 'literal', value: null };
    if (this.peekIsIdent('else')) {
      this.advance();
      alternate = this.parseExpression(0);
    }
    this.expectIdent('end');
    return this.foldBranches(branches, alternate);
  }

  /** `if ( cond )` already consumed → parse `{ … } [else if (…) {…}] [else {…}]`. */
  private parseIfBlock(cond: ExpressionNode): ExpressionNode {
    const consequent = this.parseBlock();
    let alternate: ExpressionNode = { type: 'literal', value: null };
    if (this.peekIsIdent('else')) {
      this.advance(); // else
      if (this.peekIsIdent('if')) {
        this.advance(); // if
        this.expect('LPAREN');
        const cond2 = this.parseExpression(0);
        this.expect('RPAREN');
        alternate = this.parseIfBlock(cond2);
      } else {
        alternate = this.parseBlock();
      }
    }
    return { type: 'ternary', condition: cond, consequent, alternate };
  }

  /** `{ [return] <expression> }` → the block's single value expression. */
  private parseBlock(): ExpressionNode {
    this.expect('LBRACE');
    if (this.peekIsIdent('return')) this.advance();
    const expr = this.parseExpression(0);
    this.expect('RBRACE');
    return expr;
  }

  /**
   * `[field.path]` — column reference (Excel/Tableau-style), optionally
   * dotted to address nested fields. This is intentionally stricter than
   * "anything between brackets" so array literals (`[1, 2]`, `[x > 0]`,
   * `IN [...]`) keep parsing as expressions.
   *
   * Tokenization has one wrinkle: a path segment that starts with a number,
   * such as `3Y` in `[analytics.keyRateDuration.3Y]`, arrives as NUMBER
   * token `.3` followed by IDENTIFIER token `Y` because `.3` is also valid
   * decimal syntax. The branch below treats NUMBER tokens that start with
   * `.` as the required path separator plus a numeric-leading segment.
   */
  private tryParseBracketedColumnRef(): ExpressionNode | null {
    if (this.peek().type !== 'LBRACKET') return null;
    if (this.tokens[this.pos + 1]?.type !== 'IDENTIFIER') return null;

    let scan = this.pos + 1;
    const firstSegment = this.tokens[scan];
    if (firstSegment?.type !== 'IDENTIFIER') return null;

    const parts = [firstSegment.value];
    scan++;

    while (true) {
      const next = this.tokens[scan];
      if (next?.type === 'RBRACKET') {
        this.pos = scan + 1;
        return { type: 'columnRef', columnId: parts.join('.') };
      }

      if (next?.type === 'DOT') {
        const segment = this.readPathSegmentAfterDot(scan + 1);
        if (!segment) return null;
        parts.push(segment.value);
        scan = segment.next;
        continue;
      }

      if (next?.type === 'NUMBER' && next.value.startsWith('.')) {
        const segment = this.readNumericLeadingPathSegment(scan);
        if (!segment) return null;
        parts.push(segment.value);
        scan = segment.next;
        continue;
      }

      return null;
    }
  }

  private readPathSegmentAfterDot(scan: number): { value: string; next: number } | null {
    const token = this.tokens[scan];
    if (token?.type === 'IDENTIFIER') return { value: token.value, next: scan + 1 };
    if (token?.type === 'NUMBER' && token.value.length > 0 && !token.value.startsWith('.')) {
      return { value: token.value, next: scan + 1 };
    }
    return null;
  }

  private readNumericLeadingPathSegment(scan: number): { value: string; next: number } | null {
    const token = this.tokens[scan];
    if (token?.type !== 'NUMBER' || !token.value.startsWith('.') || token.value.length <= 1) {
      return null;
    }

    let value = token.value.slice(1);
    let next = scan + 1;
    while (this.tokens[next]?.type === 'IDENTIFIER') {
      value += this.tokens[next].value;
      next++;
    }
    return { value, next };
  }
}

export function parse(tokens: Token[]): ExpressionNode {
  return new Parser(tokens).parse();
}

import { json } from "stream/consumers";
import * as fs from "fs";
import * as path from "path";
import util from "util";

interface Range {
  start: number;
  end: number;
}

interface Position {
  line: number;
  character: number;
}

interface JavaASTNode {
  nodeType: string;
  range?: Range;
  children?: JavaASTNode[];
}

function astToTxt(compilationUnit: any) {
  //ast구조 파악을 위해 임시로 txt로 출력
  const filePath = path.join(__dirname, "..", "output", "ast.txt");
  try {
    fs.writeFileSync(
      filePath,
      util.inspect(compilationUnit, { depth: null, colors: false })
    );
  } catch (err) {
    console.error(err);
  }
}

// Unique ID generator for Prolog facts
let idCounter = 1;
function generateId(prefix: string): string {
  return `${prefix}_${idCounter++}`;
}
export class PrologFactsHandler {
  private facts: string[] = [];
  private sourceCode: string = "";
  private classId: string = "";
  private lineMapping: Map<number, string> = new Map();

  async processAST(ast: any, sourceCode: string): Promise<string> {
    this.facts = [];
    this.sourceCode = sourceCode;
    this.classId = generateId("class");

    // Process the source file information
    this.processSourceFile();

    // Process the compilation unit
    await this.processCompilationUnit(ast);
    return this.facts.join("\n");
  }

  private processSourceFile(): void {
    // Generate line information
    const lines = this.sourceCode.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const lineId = generateId("line");
      this.lineMapping.set(i + 1, lineId);
      this.facts.push(`line(${this.classId}, ${i + 1}).`);
    }

    // Generate range information for the file
    const range = this.createRange(0, this.sourceCode.length, 1, lines.length);
    this.facts.push(
      `range(${this.classId}, 0, ${this.sourceCode.length}, 1, ${lines.length}).`
    );
  }

  private async processCompilationUnit(compilationUnit: any): Promise<void> {
    // Process package declaration if it exists
    // console.log(JSON.stringify(compilationUnit));
    // console.log(compilationUnit);
    // console.log(compilationUnit.children);
    // console.log(compilationUnit.children.ordinaryCompilationUnit);
    // console.log(compilationUnit.children.ordinaryCompilationUnit[0]);
    // console.log(compilationUnit.children.ordinaryCompilationUnit[0].children); //undefined

    // astToTxt(compilationUnit);

    if (compilationUnit.package) {
      await this.processPackage(compilationUnit.package);
    }

    // Process imports
    if (compilationUnit.imports && compilationUnit.imports.length > 0) {
      for (const importDecl of compilationUnit.imports) {
        await this.processImport(importDecl);
      }
    }

    // Process all types in the compilation unit
    if (compilationUnit.types && compilationUnit.types.length > 0) {
      for (const type of compilationUnit.types) {
        await this.processType(type);
      }
    }
  }

  private async processPackage(packageDecl: any): Promise<void> {
    const packageId = generateId("package");

    // Add code entity for the package
    if (packageDecl.range) {
      this.facts.push(
        `code(${packageId}, "PACKAGE", ${this.classId}, 0, ${this.getRangeId(
          packageDecl.range
        )}).`
      );

      // Add name entity for the package
      if (packageDecl.name) {
        const nameId = generateId("name");
        this.facts.push(
          `name(${nameId}, "QUALIFIED_NAME", ${packageId}, 0, ${this.getRangeId(
            packageDecl.name.range || packageDecl.range
          )}, "${packageDecl.name.identifier}").`
        );
      }
    }
  }

  private async processImport(importDecl: any): Promise<void> {
    const importId = generateId("import");

    // Add code entity for the import
    if (importDecl.range) {
      this.facts.push(
        `code(${importId}, "IMPORT", ${this.classId}, 0, ${this.getRangeId(
          importDecl.range
        )}).`
      );

      // Add name entity for the import
      if (importDecl.name) {
        const nameId = generateId("name");
        this.facts.push(
          `name(${nameId}, "QUALIFIED_NAME", ${importId}, 0, ${this.getRangeId(
            importDecl.name.range || importDecl.range
          )}, "${importDecl.name.identifier}").`
        );
      }
    }
  }

  private async processType(type: any): Promise<void> {
    const typeId = generateId("type");

    // Add code entity for the type
    this.facts.push(
      `code(${typeId}, "TYPE", ${this.classId}, 0, ${this.getRangeId(
        type.range
      )}).`
    );

    // Process type name
    if (type.name) {
      const nameRefId = generateId("name_ref");
      this.facts.push(
        `name_ref(${nameRefId}, "type", "${type.name.identifier}", "${
          type.binding || "unknown"
        }").`
      );

      const nameId = generateId("name");
      this.facts.push(
        `name(${nameId}, "SIMPLE_NAME", ${typeId}, 0, ${this.getRangeId(
          type.name.range
        )}, "${type.name.identifier}").`
      );
    }

    // Process fields
    if (type.fields && type.fields.length > 0) {
      for (let i = 0; i < type.fields.length; i++) {
        await this.processField(type.fields[i], typeId, i);
      }
    }

    // Process methods
    if (type.methods && type.methods.length > 0) {
      for (let i = 0; i < type.methods.length; i++) {
        await this.processMethod(type.methods[i], typeId, i);
      }
    }

    // Process nested types
    if (type.types && type.types.length > 0) {
      for (let i = 0; i < type.types.length; i++) {
        await this.processType(type.types[i]);
      }
    }
  }

  private async processField(
    field: any,
    parentId: string,
    index: number
  ): Promise<void> {
    const fieldId = generateId("field");

    // Add code entity for the field
    this.facts.push(
      `code(${fieldId}, "FIELD", ${parentId}, ${index}, ${this.getRangeId(
        field.range
      )}).`
    );

    // Process field name
    if (field.name) {
      const nameRefId = generateId("name_ref");
      this.facts.push(
        `name_ref(${nameRefId}, "field", "${field.name.identifier}", "${
          field.binding || "unknown"
        }").`
      );

      const nameId = generateId("name");
      this.facts.push(
        `name(${nameId}, "SIMPLE_NAME", ${fieldId}, 0, ${this.getRangeId(
          field.name.range
        )}, "${field.name.identifier}").`
      );
    }

    // Process field type
    if (field.type) {
      const typeId = generateId("type");
      this.facts.push(
        `code(${typeId}, "TYPE", ${fieldId}, 0, ${this.getRangeId(
          field.type.range
        )}).`
      );

      if (field.type.name) {
        const typeNameId = generateId("name");
        this.facts.push(
          `name(${typeNameId}, "SIMPLE_NAME", ${typeId}, 0, ${this.getRangeId(
            field.type.name.range
          )}, "${field.type.name.identifier}").`
        );
      }
    }

    // Process initialization if available
    if (field.initializer) {
      await this.processExpression(field.initializer, fieldId, 1);
    }
  }

  private async processMethod(
    method: any,
    parentId: string,
    index: number
  ): Promise<void> {
    const methodId = generateId("method");

    // Add method declaration
    this.facts.push(`method(${methodId}, ${this.getRangeId(method.range)}).`);

    // Add code entity for the method
    this.facts.push(
      `code(${methodId}, "METHOD", ${parentId}, ${index}, ${this.getRangeId(
        method.range
      )}).`
    );

    // Process method name
    if (method.name) {
      const nameRefId = generateId("name_ref");
      this.facts.push(
        `name_ref(${nameRefId}, "method", "${method.name.identifier}", "${
          method.binding || "unknown"
        }").`
      );

      const nameId = generateId("name");
      this.facts.push(
        `name(${nameId}, "SIMPLE_NAME", ${methodId}, 0, ${this.getRangeId(
          method.name.range
        )}, "${method.name.identifier}").`
      );
    }

    // Process return type if it's not a constructor
    if (method.returnType) {
      const returnTypeId = generateId("type");
      this.facts.push(
        `code(${returnTypeId}, "TYPE", ${methodId}, 0, ${this.getRangeId(
          method.returnType.range
        )}).`
      );

      if (method.returnType.name) {
        const returnTypeNameId = generateId("name");
        this.facts.push(
          `name(${returnTypeNameId}, "SIMPLE_NAME", ${returnTypeId}, 0, ${this.getRangeId(
            method.returnType.name.range
          )}, "${method.returnType.name.identifier}").`
        );
      }
    }

    // Process parameters
    if (method.parameters && method.parameters.length > 0) {
      for (let i = 0; i < method.parameters.length; i++) {
        const param = method.parameters[i];
        const paramId = generateId("param");

        // Add parameter info
        this.facts.push(`param(${paramId}, ${i}, ${methodId}).`);

        // Add code entity for the parameter
        this.facts.push(
          `code(${paramId}, "PARAMETER", ${methodId}, ${i}, ${this.getRangeId(
            param.range
          )}).`
        );

        // Process parameter name
        if (param.name) {
          const paramNameRefId = generateId("name_ref");
          this.facts.push(
            `name_ref(${paramNameRefId}, "parameter", "${
              param.name.identifier
            }", "${param.binding || "unknown"}").`
          );

          const paramNameId = generateId("name");
          this.facts.push(
            `name(${paramNameId}, "SIMPLE_NAME", ${paramId}, 0, ${this.getRangeId(
              param.name.range
            )}, "${param.name.identifier}").`
          );
        }

        // Process parameter type
        if (param.type) {
          const paramTypeId = generateId("type");
          this.facts.push(
            `code(${paramTypeId}, "TYPE", ${paramId}, 0, ${this.getRangeId(
              param.type.range
            )}).`
          );

          if (param.type.name) {
            const paramTypeNameId = generateId("name");
            this.facts.push(
              `name(${paramTypeNameId}, "SIMPLE_NAME", ${paramTypeId}, 0, ${this.getRangeId(
                param.type.name.range
              )}, "${param.type.name.identifier}").`
            );
          }
        }
      }
    }

    // Process method body
    if (method.body) {
      await this.processBlock(method.body, methodId);
    }
  }

  private async processBlock(block: any, parentId: string): Promise<void> {
    const blockId = generateId("block");

    // Add block code entity
    this.facts.push(
      `block(${blockId}, "BLOCK", ${parentId}, 0, ${this.getRangeId(
        block.range
      )}).`
    );

    // Process statements in the block
    if (block.statements && block.statements.length > 0) {
      for (let i = 0; i < block.statements.length; i++) {
        await this.processStatement(block.statements[i], blockId, i);
      }
    }
  }

  private async processStatement(
    statement: any,
    parentId: string,
    index: number
  ): Promise<string> {
    const stmtId = generateId("stmt");
    const nodeType = statement.nodeType || "STATEMENT";

    // Add statement code entity
    this.facts.push(
      `stmt(${stmtId}, "${nodeType}", ${parentId}, ${index}, ${this.getRangeId(
        statement.range
      )}).`
    );

    // Process different statement types
    switch (statement.nodeType) {
      case "RETURN_STATEMENT":
        if (statement.expression) {
          const exprId = await this.processExpression(
            statement.expression,
            stmtId,
            0
          );
          const methodId = this.findMethodId(parentId);
          if (methodId) {
            const line = this.getLineNumber(statement.range.start);
            this.facts.push(
              `return(${exprId}, ${methodId}, ${this.getLineId(line)}).`
            );
          }
        }
        break;

      case "THROW_STATEMENT":
        if (statement.expression) {
          const exprId = await this.processExpression(
            statement.expression,
            stmtId,
            0
          );
          const methodId = this.findMethodId(parentId);
          if (methodId) {
            const line = this.getLineNumber(statement.range.start);
            this.facts.push(
              `throw(${methodId}, ${exprId}, ${this.getLineId(line)}).`
            );
          }
        }
        break;

      case "EXPRESSION_STATEMENT":
        if (statement.expression) {
          await this.processExpression(statement.expression, stmtId, 0);
        }
        break;

      case "VARIABLE_DECLARATION_STATEMENT":
        // Process each fragment (variable declaration)
        if (statement.fragments && statement.fragments.length > 0) {
          for (let i = 0; i < statement.fragments.length; i++) {
            const fragment = statement.fragments[i];
            const varNameRefId = generateId("name_ref");

            if (fragment.name) {
              this.facts.push(
                `name_ref(${varNameRefId}, "variable", "${
                  fragment.name.identifier
                }", "${fragment.binding || "unknown"}").`
              );

              const varNameId = generateId("name");
              this.facts.push(
                `name(${varNameId}, "SIMPLE_NAME", ${stmtId}, ${i}, ${this.getRangeId(
                  fragment.name.range
                )}, "${fragment.name.identifier}").`
              );

              // Process initialization if available
              if (fragment.initializer) {
                const exprId = await this.processExpression(
                  fragment.initializer,
                  stmtId,
                  i + 1
                );
                const line = this.getLineNumber(fragment.range.start);
                this.facts.push(
                  `assign(${varNameId}, ${exprId}, ${this.getLineId(line)}).`
                );
              }
            }
          }
        }

        // Process the type of the variable declaration
        if (statement.type) {
          const typeId = generateId("type");
          this.facts.push(
            `code(${typeId}, "TYPE", ${stmtId}, 0, ${this.getRangeId(
              statement.type.range
            )}).`
          );

          if (statement.type.name) {
            const typeNameId = generateId("name");
            this.facts.push(
              `name(${typeNameId}, "SIMPLE_NAME", ${typeId}, 0, ${this.getRangeId(
                statement.type.name.range
              )}, "${statement.type.name.identifier}").`
            );
          }
        }
        break;

      case "IF_STATEMENT":
        if (statement.expression) {
          const condId = await this.processExpression(
            statement.expression,
            stmtId,
            0
          );

          // Process then branch
          if (statement.thenStatement) {
            await this.processStatement(statement.thenStatement, stmtId, 1);
          }

          // Process else branch
          if (statement.elseStatement) {
            await this.processStatement(statement.elseStatement, stmtId, 2);
          }
        }
        break;

      case "CONDITIONAL_EXPRESSION":
        if (
          statement.expression &&
          statement.thenExpression &&
          statement.elseExpression
        ) {
          const condId = await this.processExpression(
            statement.expression,
            stmtId,
            0
          );
          const thenId = await this.processExpression(
            statement.thenExpression,
            stmtId,
            1
          );
          const elseId = await this.processExpression(
            statement.elseExpression,
            stmtId,
            2
          );

          const line = this.getLineNumber(statement.range.start);
          this.facts.push(
            `cond_expr(${condId}, ${thenId}, ${elseId}, ${this.getLineId(
              line
            )}).`
          );
        }
        break;

      case "ASSIGNMENT":
        if (statement.leftHandSide && statement.rightHandSide) {
          const lhsId = await this.processExpression(
            statement.leftHandSide,
            stmtId,
            0
          );
          const rhsId = await this.processExpression(
            statement.rightHandSide,
            stmtId,
            1
          );

          const line = this.getLineNumber(statement.range.start);
          this.facts.push(
            `assign(${lhsId}, ${rhsId}, ${this.getLineId(line)}).`
          );
        }
        break;

      default:
        // For other statement types, process nested blocks or expressions
        if (statement.body) {
          await this.processBlock(statement.body, stmtId);
        }
        break;
    }

    return stmtId;
  }

  private async processExpression(
    expression: any,
    parentId: string,
    index: number
  ): Promise<string> {
    if (!expression) {
      return "ExprNone";
    }

    const exprId = generateId("expr");
    const nodeType = expression.nodeType || "EXPRESSION";
    const code = this.getCodeFromRange(expression.range);

    // Add expression code entity
    this.facts.push(
      `expr(${exprId}, "${nodeType}", ${parentId}, ${index}, ${this.getRangeId(
        expression.range
      )}, "${this.escapeString(code)}").`
    );

    // Process different expression types
    switch (expression.nodeType) {
      case "METHOD_INVOCATION":
        const methodRefId = generateId("name_ref");
        if (expression.name) {
          this.facts.push(
            `name_ref(${methodRefId}, "method", "${
              expression.name.identifier
            }", "${expression.binding || "unknown"}").`
          );

          const methodNameId = generateId("name");
          this.facts.push(
            `name(${methodNameId}, "SIMPLE_NAME", ${exprId}, 0, ${this.getRangeId(
              expression.name.range
            )}, "${expression.name.identifier}").`
          );
        }

        const line = this.getLineNumber(expression.range.start);
        this.facts.push(
          `method_invoc(${exprId}, ${methodRefId}, ${this.getLineId(line)}).`
        );

        // Process expression (object/receiver)
        if (expression.expression) {
          await this.processExpression(expression.expression, exprId, 0);
        }

        // Process arguments
        if (expression.arguments && expression.arguments.length > 0) {
          for (let i = 0; i < expression.arguments.length; i++) {
            const argId = await this.processExpression(
              expression.arguments[i],
              exprId,
              i + 1
            );
            this.facts.push(`argument(${argId}, ${i}, ${exprId}).`);
          }
        }
        break;

      case "SIMPLE_NAME":
      case "QUALIFIED_NAME":
        const nameRefId = generateId("name_ref");
        const nameType = this.getNameType(expression);
        this.facts.push(
          `name_ref(${nameRefId}, "${nameType}", "${expression.identifier}", "${
            expression.binding || "unknown"
          }").`
        );

        const nameId = generateId("name");
        this.facts.push(
          `name(${nameId}, "${nodeType}", ${parentId}, ${index}, ${this.getRangeId(
            expression.range
          )}, "${expression.identifier}").`
        );

        // Add reference information
        const refLine = this.getLineNumber(expression.range.start);
        this.facts.push(
          `ref(${nameId}, ${exprId}, ${this.getLineId(refLine)}).`
        );

        return nameId; // Return nameId for names, as it's used in many semantic facts

      case "STRING_LITERAL":
      case "NUMBER_LITERAL":
      case "BOOLEAN_LITERAL":
      case "NULL_LITERAL":
      case "CHARACTER_LITERAL":
        const literalId = generateId("literal");
        const value = expression.token || expression.literalValue || code;
        this.facts.push(
          `literal(${literalId}, "${nodeType}", ${parentId}, ${index}, ${this.getRangeId(
            expression.range
          )}, "${this.escapeString(value)}").`
        );
        return literalId;

      case "CONDITIONAL_EXPRESSION":
        if (
          expression.expression &&
          expression.thenExpression &&
          expression.elseExpression
        ) {
          const condId = await this.processExpression(
            expression.expression,
            exprId,
            0
          );
          const thenId = await this.processExpression(
            expression.thenExpression,
            exprId,
            1
          );
          const elseId = await this.processExpression(
            expression.elseExpression,
            exprId,
            2
          );

          const condLine = this.getLineNumber(expression.range.start);
          this.facts.push(
            `cond_expr(${condId}, ${thenId}, ${elseId}, ${this.getLineId(
              condLine
            )}).`
          );
        }
        break;

      case "FIELD_ACCESS":
        if (expression.expression && expression.name) {
          await this.processExpression(expression.expression, exprId, 0);

          const fieldNameRefId = generateId("name_ref");
          this.facts.push(
            `name_ref(${fieldNameRefId}, "field", "${
              expression.name.identifier
            }", "${expression.binding || "unknown"}").`
          );

          const fieldNameId = generateId("name");
          this.facts.push(
            `name(${fieldNameId}, "SIMPLE_NAME", ${exprId}, 1, ${this.getRangeId(
              expression.name.range
            )}, "${expression.name.identifier}").`
          );
        }
        break;
    }

    return exprId;
  }

  // Helper methods
  private getNameType(nameNode: any): string {
    if (!nameNode.binding) {
      return "unknown";
    }

    // Try to determine the name type based on binding information
    const binding = nameNode.binding;
    if (binding.includes("METHOD:")) {
      return "method";
    } else if (binding.includes("FIELD:")) {
      return "field";
    } else if (binding.includes("VARIABLE:")) {
      return "variable";
    } else if (binding.includes("TYPE:")) {
      return "type";
    } else if (binding.includes("PACKAGE:")) {
      return "package";
    } else {
      return "unknown";
    }
  }

  private getCodeFromRange(range: any): string {
    if (!range || !range.start || !range.end) {
      return "";
    }

    const start = range.start;
    const end = range.end;

    try {
      return this.sourceCode.substring(start, end);
    } catch (e) {
      return "";
    }
  }

  private getLineNumber(position: number): number {
    const lines = this.sourceCode.substring(0, position).split("\n");
    return lines.length;
  }

  private getLineId(lineNumber: number): string {
    return this.lineMapping.get(lineNumber) || "unknown_line";
  }

  private getRangeId(range: any): string {
    if (!range) {
      return "unknown_range";
    }

    const rangeId = generateId("range");
    const startLine = this.getLineNumber(range.start);
    const endLine = this.getLineNumber(range.end);

    this.facts.push(
      `range(${this.classId}, ${range.start}, ${
        range.end - range.start
      }, ${startLine}, ${endLine}).`
    );

    return rangeId;
  }

  private createRange(
    start: number,
    length: number,
    startLine: number,
    endLine: number
  ): string {
    const rangeId = generateId("range");
    this.facts.push(
      `range(${this.classId}, ${start}, ${length}, ${startLine}, ${endLine}).`
    );
    return rangeId;
  }

  private findMethodId(blockId: string): string | null {
    // This is a simplified approach - we assume the parent hierarchy
    // In a real implementation, you'd need to traverse the AST upwards
    if (blockId.startsWith("method_")) {
      return blockId;
    }
    return null;
  }

  private escapeString(str: string): string {
    if (!str) {
      return "";
    }
    return str.replace(/"/g, '\\"').replace(/\n/g, "\\n");
  }
}

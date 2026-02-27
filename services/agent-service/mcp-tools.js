import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { compileLatexLocal } from "./latex-utils.js";
import { analyzeLatexStructure, formatQualityReport } from "./quality-analyzer.js";

/**
 * Create an MCP server with AEE-specific tools.
 *
 * @param {object} ctx
 * @param {string} ctx.workDir - workspace directory path
 * @param {string|null} ctx.studentData - pre-fetched student data text
 * @param {Record<string,string>} ctx.promptTemplates - slug → template text
 * @param {Record<string,string>} ctx.proMaxEnhancements - slug → pro max instructions
 */
export function createAEEMcpServer(ctx) {
  const compileLatexTool = tool(
    "compile_latex",
    "Compila um arquivo .tex em PDF usando pdflatex. O preamble profissional AEE é injetado automaticamente. Retorna sucesso ou erro de compilação com número da linha.",
    {
      path: z.string().describe("Caminho relativo do arquivo .tex no projeto (ex: documento.tex)"),
    },
    async (args) => {
      try {
        const result = await compileLatexLocal(args.path, ctx.workDir);
        if (result.success) {
          return {
            content: [{ type: "text", text: result.output }],
          };
        }
        return {
          content: [{ type: "text", text: result.error }],
          isError: true,
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Erro ao compilar: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  const getStudentDataTool = tool(
    "get_student_data",
    "Retorna os dados do aluno vinculado ao projeto. Sem parâmetros necessários.",
    {},
    async () => {
      if (!ctx.studentData) {
        return {
          content: [{
            type: "text",
            text: "Nenhum aluno vinculado ao projeto. Pergunte o nome, diagnóstico e série do aluno diretamente à professora e use as informações fornecidas para gerar o documento.",
          }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: ctx.studentData }],
      };
    }
  );

  const getPromptTemplateTool = tool(
    "get_prompt_template",
    "Retorna o template de prompt AEE para o tipo de documento especificado pelo slug.",
    {
      slug: z.string().describe("Slug do template (ex: anamnese, pei, pdi, estudo-de-caso, parecer-descritivo, plano-intervencao, adaptacoes-curriculares, sugestao-atendimento, etc.)"),
    },
    async (args) => {
      const template = ctx.promptTemplates[args.slug];
      if (!template) {
        const available = Object.keys(ctx.promptTemplates).join(", ");
        return {
          content: [{
            type: "text",
            text: `Template não encontrado: ${args.slug}\n\nTemplates disponíveis: ${available}`,
          }],
          isError: true,
        };
      }

      let output = template;

      // Append Pro Max enhancements if available
      if (ctx.proMaxEnhancements && ctx.proMaxEnhancements[args.slug]) {
        output += `\n\n--- INSTRUÇÕES PRO MAX ---\n${ctx.proMaxEnhancements[args.slug]}`;
      }

      return {
        content: [{ type: "text", text: output }],
      };
    }
  );

  const assessQualityTool = tool(
    "assess_quality",
    "Avalia qualidade de um documento .tex: score 0-100, elementos visuais, estrutura, desertos de texto, fixes prioritários. Use APÓS compilar com sucesso.",
    {
      path: z.string().describe("Caminho relativo do arquivo .tex (ex: anamnese.tex)"),
    },
    async (args) => {
      try {
        const absPath = path.join(ctx.workDir, args.path);
        if (!fs.existsSync(absPath)) {
          return {
            content: [{ type: "text", text: `Arquivo não encontrado: ${args.path}` }],
            isError: true,
          };
        }
        const content = fs.readFileSync(absPath, "utf-8");
        const metrics = analyzeLatexStructure(content);
        const report = formatQualityReport(metrics, "promax");
        return {
          content: [{ type: "text", text: report }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Erro ao avaliar qualidade: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  return createSdkMcpServer({
    name: "aee-pro-tools",
    version: "1.0.0",
    tools: [compileLatexTool, getStudentDataTool, getPromptTemplateTool, assessQualityTool],
  });
}

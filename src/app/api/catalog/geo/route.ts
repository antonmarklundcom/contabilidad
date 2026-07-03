import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { departamentos, distritos, ciudades } from "@/lib/sifen/catalogs";

/**
 * Geo catalog lookup for the Settings company form.
 * ?level=departamento | distrito&departamento=N | ciudad&distrito=N
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const level = url.searchParams.get("level");
  const parent = Number(url.searchParams.get("parent"));

  if (level === "departamento") {
    return NextResponse.json(
      departamentos.map((d) => ({ codigo: Number(d.codigo), descripcion: d.descripcion }))
    );
  }
  if (level === "distrito") {
    return NextResponse.json(
      distritos
        .filter((d) => d.departamento === parent)
        .map((d) => ({ codigo: Number(d.codigo), descripcion: d.descripcion }))
    );
  }
  if (level === "ciudad") {
    return NextResponse.json(
      ciudades
        .filter((c) => c.distrito === parent)
        .map((c) => ({ codigo: Number(c.codigo), descripcion: c.descripcion }))
    );
  }
  return NextResponse.json({ error: "bad_level" }, { status: 400 });
}

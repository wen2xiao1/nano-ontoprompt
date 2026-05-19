import json
import csv
import io
import yaml
from sqlalchemy.orm import Session
from app.models.ontology import OntologyProject
from app.models.entity import Entity
from app.models.logic import LogicRule
from app.models.action import Action
from app.models.relation import Relation

def _collect_data(db: Session, ontology_id: str) -> dict:
    project = db.query(OntologyProject).filter(OntologyProject.id == ontology_id).first()
    entities = db.query(Entity).filter(Entity.ontology_id == ontology_id).all()
    logic_rules = db.query(LogicRule).filter(LogicRule.ontology_id == ontology_id).all()
    actions = db.query(Action).filter(Action.ontology_id == ontology_id).all()
    relations = db.query(Relation).filter(Relation.ontology_id == ontology_id).all()
    return {
        "project": project,
        "entities": entities,
        "logic_rules": logic_rules,
        "actions": actions,
        "relations": relations,
    }

def export_json(db: Session, ontology_id: str) -> str:
    data = _collect_data(db, ontology_id)
    p = data["project"]
    return json.dumps({
        "ontology": {"id": p.id, "name": p.name, "domain": p.domain, "version": p.version},
        "entities": [{"id": e.id, "name_cn": e.name_cn, "name_en": e.name_en, "type": e.type,
                      "description": e.description, "confidence": e.confidence} for e in data["entities"]],
        "logic_rules": [{"id": r.id, "name_cn": r.name_cn, "formula": r.formula, "confidence": r.confidence} for r in data["logic_rules"]],
        "actions": [{"id": a.id, "name_cn": a.name_cn, "execution_rule": a.execution_rule} for a in data["actions"]],
        "relations": [{"source": r.source_entity, "target": r.target_entity, "type": r.type} for r in data["relations"]],
    }, ensure_ascii=False, indent=2)

def export_yaml(db: Session, ontology_id: str) -> str:
    data = json.loads(export_json(db, ontology_id))
    return yaml.dump(data, allow_unicode=True, default_flow_style=False)

def export_csv(db: Session, ontology_id: str) -> str:
    data = _collect_data(db, ontology_id)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["type", "id", "name_cn", "name_en", "description", "confidence"])
    for e in data["entities"]:
        w.writerow(["entity", e.id, e.name_cn, e.name_en, e.description, e.confidence])
    for r in data["logic_rules"]:
        w.writerow(["logic_rule", r.id, r.name_cn, r.name_en, r.description, r.confidence])
    for a in data["actions"]:
        w.writerow(["action", a.id, a.name_cn, a.name_en, a.description, a.confidence])
    return out.getvalue()

def export_ttl(db: Session, ontology_id: str) -> str:
    from rdflib import Graph, Literal, Namespace, RDF, OWL, RDFS
    data = _collect_data(db, ontology_id)
    p = data["project"]
    g = Graph()
    NS = Namespace(f"http://ontoprompt.local/ontologies/{ontology_id}#")
    g.bind("onto", NS)
    g.bind("owl", OWL)
    g.add((NS[p.name.replace(" ", "_")], RDF.type, OWL.Ontology))
    for e in data["entities"]:
        cls = NS[e.name_en.replace(" ", "_") if e.name_en else e.name_cn.replace(" ", "_")]
        g.add((cls, RDF.type, OWL.Class))
        g.add((cls, RDFS.label, Literal(e.name_cn, lang="zh")))
        if e.name_en:
            g.add((cls, RDFS.label, Literal(e.name_en, lang="en")))
        if e.description:
            g.add((cls, RDFS.comment, Literal(e.description)))
    return g.serialize(format="turtle")

def export_html(db: Session, ontology_id: str) -> str:
    data = _collect_data(db, ontology_id)
    p = data["project"]
    rows = ""
    for e in data["entities"]:
        rows += f"<tr><td>Entity</td><td>{e.name_cn}</td><td>{e.name_en or ''}</td><td>{e.confidence}</td></tr>"
    for r in data["logic_rules"]:
        rows += f"<tr><td>Logic</td><td>{r.name_cn}</td><td>{r.name_en or ''}</td><td>{r.confidence}</td></tr>"
    for a in data["actions"]:
        rows += f"<tr><td>Action</td><td>{a.name_cn}</td><td>{a.name_en or ''}</td><td>{a.confidence}</td></tr>"
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{p.name}</title>
<style>body{{font-family:sans-serif;padding:2rem}}table{{border-collapse:collapse;width:100%}}
th,td{{border:1px solid #ddd;padding:8px;text-align:left}}th{{background:#f5f5f5}}</style></head>
<body><h1>{p.name}</h1><p>Domain: {p.domain} | Version: {p.version}</p>
<table><thead><tr><th>类型</th><th>中文名</th><th>英文名</th><th>置信度</th></tr></thead>
<tbody>{rows}</tbody></table></body></html>"""

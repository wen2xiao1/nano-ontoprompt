from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models.entity import Entity
from app.schemas.entity import EntityCreate, EntityUpdate, EntityOut
import uuid

router = APIRouter()

@router.get("")
def list_entities(ontology_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    items = db.query(Entity).filter(Entity.ontology_id == ontology_id).all()
    return {"data": [EntityOut.model_validate(e).model_dump() for e in items]}

@router.post("", status_code=201)
def create_entity(ontology_id: str, body: EntityCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    e = Entity(id=str(uuid.uuid4()), ontology_id=ontology_id, **data)
    db.add(e); db.commit(); db.refresh(e)
    return {"data": EntityOut.model_validate(e).model_dump()}

@router.get("/{entity_id}")
def get_entity(ontology_id: str, entity_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    e = db.query(Entity).filter(Entity.id == entity_id, Entity.ontology_id == ontology_id).first()
    if not e:
        raise HTTPException(404, "Not found")
    return {"data": EntityOut.model_validate(e).model_dump()}

@router.put("/{entity_id}")
def update_entity(ontology_id: str, entity_id: str, body: EntityUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    e = db.query(Entity).filter(Entity.id == entity_id, Entity.ontology_id == ontology_id).first()
    if not e:
        raise HTTPException(404, "Not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(e, k, v)
    db.commit(); db.refresh(e)
    return {"data": EntityOut.model_validate(e).model_dump()}

@router.delete("/{entity_id}", status_code=204)
def delete_entity(ontology_id: str, entity_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    e = db.query(Entity).filter(Entity.id == entity_id, Entity.ontology_id == ontology_id).first()
    if not e:
        raise HTTPException(404, "Not found")
    db.delete(e); db.commit()

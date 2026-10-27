from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator


Identifier = Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Question(Contract):
    id: Identifier
    type: Literal["choice", "likert", "text"]
    parentId: Identifier | None = None
    text: str = ""
    options: list[str] = Field(default_factory=list)
    otherEnabled: bool = False
    scale: Literal[3, 5, 7] = 5
    low: str = ""
    high: str = ""


class SurveyContent(Contract):
    title: str = ""
    description: str = ""
    questions: list[Question] = Field(default_factory=list, max_length=1000)

    @model_validator(mode="after")
    def valid_question_references(self):
        by_id = {q.id: q for q in self.questions}
        if len(by_id) != len(self.questions):
            raise ValueError("문항 ID가 중복되었습니다.")
        for q in self.questions:
            if q.parentId is not None:
                parent = by_id.get(q.parentId)
                if parent is None or parent.id == q.id or parent.parentId is not None:
                    raise ValueError("후속 질문은 같은 설문의 최상위 문항을 참조해야 합니다.")
        return self


class SurveyVersion(SurveyContent):
    version: int = Field(ge=1)
    created: str


class Survey(SurveyContent):
    # Accept legacy imports; API read models derive these fields from immutable server versions.
    version: int = Field(default=0, ge=0)
    draft: bool = True
    history: list[SurveyVersion] = Field(default_factory=list)


class Person(Contract):
    id: Identifier
    attributes: dict[str, JsonValue]
    sourceRecordId: str | None = Field(default=None, exclude_if=lambda v: v is None)


class Cohort(Contract):
    id: Identifier | None = Field(default=None, exclude_if=lambda v: v is None)
    source: dict[str, JsonValue] | None = Field(default=None, exclude_if=lambda v: v is None)
    builtFrom: str
    created: str
    people: list[Person] = Field(max_length=500)
    textFiltersIgnored: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_people(self):
        if len({p.id for p in self.people}) != len(self.people):
            raise ValueError("집단 안에서 페르소나 ID가 중복되었습니다.")
        return self


class CohortReference(Contract):
    id: Identifier


class Group(Contract):
    id: Identifier
    name: str = ""
    # Empty/temporarily invalid counts are valid *drafts*. Execution still requires 10–500.
    count: int | None = Field(default=100, ge=0, le=9999, strict=True)
    filters: dict[str, list[str]] = Field(default_factory=dict)
    cohort: Cohort | CohortReference | None = None


class ModelSelection(Contract):
    id: Literal["glm", "qwen", "exaone", "gpt"]


class ConnectedModelSelection(Contract):
    connectionId: Identifier
    modelId: str = Field(min_length=1, max_length=200, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$")


class ProjectDocument(Contract):
    id: Identifier
    name: str = Field(min_length=1, max_length=500)
    description: str = ""
    survey: Survey
    groups: list[Group] = Field(min_length=1, max_length=100)
    activeGroupId: Identifier
    model: ModelSelection | ConnectedModelSelection | None = None

    @model_validator(mode="after")
    def valid_group_references(self):
        ids = {g.id for g in self.groups}
        if len(ids) != len(self.groups):
            raise ValueError("대상 집단 ID가 중복되었습니다.")
        if self.activeGroupId not in ids:
            raise ValueError("선택한 대상 집단이 프로젝트에 없습니다.")
        if not self.name.strip():
            raise ValueError("프로젝트 이름을 입력하세요.")
        return self


class SaveProject(Contract):
    expectedRevision: int = Field(ge=0, strict=True)
    mutationId: Identifier
    document: ProjectDocument


class ProjectResponse(ProjectDocument):
    revision: int
    lastMutationId: str
    updated: str


class ProjectList(Contract):
    projects: list[ProjectResponse]

import { CreatePostDto } from './create-post.dto';

// PUT은 title/summary/body/category/tags/seriesTitle 전체 수정 — slug는 절대 안 바뀜(고정)
export class UpdatePostDto extends CreatePostDto {}

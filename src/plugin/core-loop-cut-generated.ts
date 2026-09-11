// @ts-nocheck
// Derived from Blockbench 5.1.6 js/modeling/mesh/loop_cut.ts (JannisX11/Blockbench).
// SPDX-License-Identifier: GPL-3.0-or-later
// Source SHA-256: 2daccf0a47aa483d356e7c91a177c200c605ec61e76fdcbaa94d35802883baee
// Attribute hooks and optional per-mesh length/offset adaptation.
export const loopCutRuntime = "click(){let i,e,t=0;Mesh.selected.forEach(r=>{i||(e=r.getSelectedFaces()[0],i=r.faces[e])});function n(r=0){if(i=Mesh.selected.last().faces[e],i){let s=i.getSortedVertices(),l=Mesh.selected[0].vertices[s[(0+r)%i.vertices.length]],c=Mesh.selected[0].vertices[s[(1+r)%i.vertices.length]];return Math.sqrt(Math.pow(c[0]-l[0],2)+Math.pow(c[1]-l[1],2)+Math.pow(c[2]-l[2],2))}else{let s=Mesh.selected[0].getSelectedVertices(),l=Mesh.selected[0].vertices[s[0]],c=Mesh.selected[0].vertices[s[1]];return Math.sqrt(Math.pow(c[0]-l[0],2)+Math.pow(c[1]-l[1],2)+Math.pow(c[2]-l[2],2))}}let a=n();function o(r,s,l=0,c=1){Undo.initEdit({elements:Mesh.selected,selection:!0},r),s==null&&(s=a/(c+1)),Mesh.selected.forEach(d=>{let u=d.getSelectedVertices(),p=d.getSelectedFaces().map(y=>d.faces[y]),m,_=1;for(let y in d.faces){let A=d.faces[y];if(A.vertices.length<2)continue;let R=A.vertices.filter(j=>u.includes(j));R.length>_&&(m=A,_=R.length)}if(!m)return;let f=[m],g={};function v(y,A){let R=y.slice().sort().join(\".\"),j=g[R];if(j)return j;let V=d.vertices[y[0]].map((L,O)=>Math.lerp(L,d.vertices[y[1]][O],A)),[U]=d.addVertices(V);return g[R]=U,U}function b(y,A,R,j){f.push(y);let V=y.getSortedVertices(),U=V.indexOf(A[0])-V.indexOf(A[1]);if((U==-1||U>2)&&A.reverse(),y.vertices.length==4){let L=V.filter(H=>!A.includes(H)),O=V.indexOf(L[0])-V.indexOf(L[1]);(O==1||O<-2)&&L.reverse();let J=s/a;c>1&&(J=1-1/(c+1-j)*J*2);let ie=[v(A,J),v(L,J)],te=[Math.lerp(y.uv[A[0]][0],y.uv[A[1]][0],J),Math.lerp(y.uv[A[0]][1],y.uv[A[1]][1],J)],me=[Math.lerp(y.uv[L[0]][0],y.uv[L[1]][0],J),Math.lerp(y.uv[L[0]][1],y.uv[L[1]][1],J)],Q=new MeshFace(d,y).extend({vertices:[A[1],ie[0],ie[1],L[1]],uv:{[A[1]]:y.uv[A[1]],[ie[0]]:te,[ie[1]]:me,[L[1]]:y.uv[L[1]]}});if(y.extend({vertices:[L[0],ie[0],ie[1],A[0]],uv:{[L[0]]:y.uv[L[0]],[ie[0]]:te,[ie[1]]:me,[A[0]]:y.uv[A[0]]}}),d.addFaces(Q),j+1<c&&b(y,[ie[0],A[0]],R,j+1),j!=0)return;for(let H in d.faces){let re=d.faces[H];if(re.vertices.length<3||f.includes(re))continue;if(re.vertices.filter(pe=>L.includes(pe)).length>=2){b(re,L,re.vertices.length==4,0);break}}if(R)for(let H in d.faces){let re=d.faces[H];if(re.vertices.length<3||f.includes(re))continue;if(re.vertices.filter(pe=>A.includes(pe)).length>=2){let xe=re.getSortedVertices().filter(le=>!A.includes(le));if(xe.length==2){b(re,xe,re.vertices.length==4,0);break}else if(xe.length==1){b(re,A,!1,0);break}}}}else if(y.vertices.length==3)if(l>2){let L=V.find(pe=>!A.includes(pe)),O=[A[l%A.length],L],J=V.indexOf(O[0])-V.indexOf(O[1]);(J==1||J<-2)&&O.reverse();let ie=s/a;c>1&&(ie=1-1/(c+1-j)*ie*2);let te=[v(A,ie),v(O,ie)],me=[Math.lerp(y.uv[A[0]][0],y.uv[A[1]][0],ie),Math.lerp(y.uv[A[0]][1],y.uv[A[1]][1],ie)],Q=[Math.lerp(y.uv[O[0]][0],y.uv[O[1]][0],ie),Math.lerp(y.uv[O[0]][1],y.uv[O[1]][1],ie)],H=A.find(pe=>!O.includes(pe)),re=A.find(pe=>O.includes(pe)),K=new MeshFace(d,y).extend({vertices:[re,te[0],te[1]],uv:{[re]:y.uv[re],[te[0]]:me,[te[1]]:Q}});if(K.getAngleTo(y)>90&&K.invert(),y.extend({vertices:[L,te[0],te[1],H],uv:{[L]:y.uv[L],[te[0]]:me,[te[1]]:Q,[H]:y.uv[H]}}),y.getAngleTo(K)>90&&y.invert(),d.addFaces(K),j+1<c&&b(y,[te[0],H],R,j+1),j!=0)return;for(let pe in d.faces){let xe=d.faces[pe];if(xe.vertices.length<3||f.includes(xe))continue;if(xe.vertices.filter(Be=>O.includes(Be)).length>=2){b(xe,O,xe.vertices.length==4,0);break}}if(R)for(let pe in d.faces){let xe=d.faces[pe];if(xe.vertices.length<3||f.includes(xe))continue;if(xe.vertices.filter(Be=>A.includes(Be)).length>=2){let X=xe.getSortedVertices().filter(ne=>!A.includes(ne));if(X.length==2){b(xe,X,xe.vertices.length==4,0);break}}}}else{let L=V.find(me=>!A.includes(me)),O=s/a;c>1&&(O=1-1/(c+1-j)*O*2);let J=v(A,O),ie=[Math.lerp(y.uv[A[0]][0],y.uv[A[1]][0],O),Math.lerp(y.uv[A[0]][1],y.uv[A[1]][1],O)],te=new MeshFace(d,y).extend({vertices:[A[1],J,L],uv:{[A[1]]:y.uv[A[1]],[J]:ie,[L]:y.uv[L]}});y.extend({vertices:[L,J,A[0]],uv:{[L]:y.uv[L],[J]:ie,[A[0]]:y.uv[A[0]]}}),l%3==2&&(te.invert(),y.invert()),d.addFaces(te)}else if(y.vertices.length==2){let L=s/a;c>1&&(L=1-1/(c+1-j)*L*2);let O=v(A,L),J=[Math.lerp(y.uv[A[0]][0],y.uv[A[1]][0],L),Math.lerp(y.uv[A[0]][1],y.uv[A[1]][1],L)],ie=new MeshFace(d,y).extend({vertices:[A[1],O],uv:{[A[1]]:y.uv[A[1]],[O]:J}});y.extend({vertices:[O,A[0]],uv:{[O]:J,[A[0]]:y.uv[A[0]]}}),d.addFaces(ie),j+1<c&&b(y,[O,A[0]],R,j+1)}}let x=m.getSortedVertices().filter((y,A)=>u.includes(y));p.remove(m);let w=m.getEdges().find(y=>y.allAre(A=>u.includes(A))&&p.find(A=>A.vertices.includes(y[0])&&A.vertices.includes(y[1])));w&&(x=w);let E=[x[l%x.length],x[(l+1)%x.length]];E.length==1&&E.splice(0,0,x[0]),b(m,E,m.vertices.length==4||l>2,0),u.empty();for(let y in g)u.safePush(g[y])}),Undo.finishEdit(\"Create loop cut\"),Canvas.updateView({elements:Mesh.selected,element_aspects:{geometry:!0,uv:!0,faces:!0},selection:!0})}o(),Undo.amendEdit({direction:{type:\"num_slider\",value:0,label:\"edit.loop_cut.direction\",condition:!!i,min:0},cuts:{type:\"num_slider\",value:1,label:\"edit.loop_cut.cuts\",min:0,max:16},offset:{type:\"num_slider\",value:a/2,label:\"edit.loop_cut.offset\",min:0,interval_type:\"position\"},unit:{type:\"inline_select\",label:\"edit.loop_cut.unit\",options:{size:\"edit.loop_cut.unit.size_units\",percent:\"edit.loop_cut.unit.percent\"}}},(r,s)=>{let l=r.direction||0;a=n(l);let c=r.offset;r.unit==\"percent\"&&(c=c/100*a),c=Math.clamp(c,0,a),t!==l&&(c=a/2,s.setValues({offset:c},!1),t=l),o(!0,c,l,r.cuts)})}";
export function runCoreLoopCut(b, onVertex, resolveLength, resolveMeshLength) {
const {Mesh,MeshFace,Undo,Canvas}=b;

		let selected_face: MeshFace,
			selected_face_key: string;
		let saved_direction = 0;
		Mesh.selected.forEach(mesh => {
			if (!selected_face) {
				selected_face_key = mesh.getSelectedFaces()[0];
				selected_face = mesh.faces[selected_face_key];
			}
		})
		function getLength(direction = 0) {
            if (resolveLength) return resolveLength(direction);
			selected_face = Mesh.selected.last().faces[selected_face_key];
			if (selected_face) {
				let vertices = selected_face.getSortedVertices();
				let pos1 = Mesh.selected[0].vertices[vertices[(0 + direction) % selected_face.vertices.length]];
				let pos2 = Mesh.selected[0].vertices[vertices[(1 + direction) % selected_face.vertices.length]];
				return Math.sqrt(Math.pow(pos2[0] - pos1[0], 2) + Math.pow(pos2[1] - pos1[1], 2) + Math.pow(pos2[2] - pos1[2], 2));
			} else {
				let vertices = Mesh.selected[0].getSelectedVertices();
				let pos1 = Mesh.selected[0].vertices[vertices[0]];
				let pos2 = Mesh.selected[0].vertices[vertices[1]];
				return Math.sqrt(Math.pow(pos2[0] - pos1[0], 2) + Math.pow(pos2[1] - pos1[1], 2) + Math.pow(pos2[2] - pos1[2], 2));
			}
		}
		let length = getLength();

		function runEdit(amended?: boolean, offset?: number, direction = 0, cuts = 1, unit = 'size') {
			Undo.initEdit({elements: Mesh.selected, selection: true}, amended);
			const implicitOffset = offset == undefined;
            if (offset == undefined) offset = length / (cuts+1);
            const referenceOffset = offset, referenceLength = length;
			Mesh.selected.forEach(mesh => {
				let length = resolveMeshLength ? resolveMeshLength(mesh, direction) : referenceLength;
                let offset = resolveMeshLength ? (implicitOffset ? length/(cuts+1) : unit === 'percent' ? referenceOffset/referenceLength*length : Math.clamp(referenceOffset, 0, length)) : referenceOffset;
                let selected_vertices = mesh.getSelectedVertices();
				let selected_faces = mesh.getSelectedFaces().map(fkey => mesh.faces[fkey]);
				let start_face: MeshFace;
				let start_face_quality = 1;
				for (let fkey in mesh.faces) {
					let face = mesh.faces[fkey];
					if (face.vertices.length < 2) continue;
					let vertices = face.vertices.filter(vkey => selected_vertices.includes(vkey))
					if (vertices.length > start_face_quality) {
						start_face = face;
						start_face_quality = vertices.length;
					}
				}
				if (!start_face) return;
				let processed_faces: MeshFace[] = [start_face];
				let center_vertices_map = {};

				function getCenterVertex(vertices: string[], ratio: number) {
					let edge_key = vertices.slice().sort().join('.');
					let existing_key = center_vertices_map[edge_key];
					if (existing_key) return existing_key;

					let vector = mesh.vertices[vertices[0]].map((v, i) => Math.lerp(v, mesh.vertices[vertices[1]][i], ratio)) as ArrayVector3;
					let [vkey] = mesh.addVertices(vector);
                    onVertex(mesh, vertices, ratio, vkey);
					center_vertices_map[edge_key] = vkey;
					return vkey;
				}

				function splitFace(face: MeshFace, side_vertices: string[], double_side: boolean, cut_no: number) {
					processed_faces.push(face);
					let sorted_vertices = face.getSortedVertices();

					let side_index_diff = sorted_vertices.indexOf(side_vertices[0]) - sorted_vertices.indexOf(side_vertices[1]);
					if (side_index_diff == -1 || side_index_diff > 2) side_vertices.reverse();

					if (face.vertices.length == 4) {

						let opposite_vertices = sorted_vertices.filter(vkey => !side_vertices.includes(vkey));
						let opposite_index_diff = sorted_vertices.indexOf(opposite_vertices[0]) - sorted_vertices.indexOf(opposite_vertices[1]);
						if (opposite_index_diff == 1 || opposite_index_diff < -2) opposite_vertices.reverse();

						let ratio = offset/length;
						if (cuts > 1) {
							ratio = 1 - (1 / (cuts + 1 - cut_no) * ratio * 2);
						}
						let center_vertices = [
							getCenterVertex(side_vertices, ratio),
							getCenterVertex(opposite_vertices, ratio)
						]

						let c1_uv_coords = [
							Math.lerp(face.uv[side_vertices[0]][0], face.uv[side_vertices[1]][0], ratio),
							Math.lerp(face.uv[side_vertices[0]][1], face.uv[side_vertices[1]][1], ratio),
						];
						let c2_uv_coords = [
							Math.lerp(face.uv[opposite_vertices[0]][0], face.uv[opposite_vertices[1]][0], ratio),
							Math.lerp(face.uv[opposite_vertices[0]][1], face.uv[opposite_vertices[1]][1], ratio),
						];

						let new_face = new MeshFace(mesh, face).extend({
							vertices: [side_vertices[1], center_vertices[0], center_vertices[1], opposite_vertices[1]],
							uv: {
								[side_vertices[1]]: face.uv[side_vertices[1]],
								[center_vertices[0]]: c1_uv_coords,
								[center_vertices[1]]: c2_uv_coords,
								[opposite_vertices[1]]: face.uv[opposite_vertices[1]],
							}
						})
						face.extend({
							vertices: [opposite_vertices[0], center_vertices[0], center_vertices[1], side_vertices[0]],
							uv: {
								[opposite_vertices[0]]: face.uv[opposite_vertices[0]],
								[center_vertices[0]]: c1_uv_coords,
								[center_vertices[1]]: c2_uv_coords,
								[side_vertices[0]]: face.uv[side_vertices[0]],
							}
						})
						mesh.addFaces(new_face);

						// Multiple loop cuts
						if (cut_no+1 < cuts) {
							splitFace(face, [center_vertices[0], side_vertices[0]], double_side, cut_no+1);
						}

						if (cut_no != 0) return;
						// Find next (and previous) face
						for (let fkey in mesh.faces) {
							let ref_face = mesh.faces[fkey];
							if (ref_face.vertices.length < 3 || processed_faces.includes(ref_face)) continue;
							let vertices = ref_face.vertices.filter(vkey => opposite_vertices.includes(vkey))
							if (vertices.length >= 2) {
								splitFace(ref_face, opposite_vertices, ref_face.vertices.length == 4, 0);
								break;
							}
						}

						if (double_side) {
							for (let fkey in mesh.faces) {
								let ref_face = mesh.faces[fkey];
								if (ref_face.vertices.length < 3 || processed_faces.includes(ref_face)) continue;
								let vertices = ref_face.vertices.filter(vkey => side_vertices.includes(vkey))
								if (vertices.length >= 2) {
									let ref_sorted_vertices = ref_face.getSortedVertices();
									let ref_opposite_vertices = ref_sorted_vertices.filter(vkey => !side_vertices.includes(vkey));
									
									if (ref_opposite_vertices.length == 2) {
										splitFace(ref_face, ref_opposite_vertices, ref_face.vertices.length == 4, 0);
										break;
									} else if (ref_opposite_vertices.length == 1) {
										splitFace(ref_face, side_vertices, false, 0);
										break;
									}
								}
							}
						}

					} else if (face.vertices.length == 3) {
						if (direction > 2) {
							// Split tri from edge to edge

							let opposed_vertex = sorted_vertices.find(vkey => !side_vertices.includes(vkey));
							let opposite_vertices = [side_vertices[direction % side_vertices.length], opposed_vertex];

							let opposite_index_diff = sorted_vertices.indexOf(opposite_vertices[0]) - sorted_vertices.indexOf(opposite_vertices[1]);
							if (opposite_index_diff == 1 || opposite_index_diff < -2) opposite_vertices.reverse();

							let ratio = offset/length;
							if (cuts > 1) {
								ratio = 1 - (1 / (cuts + 1 - cut_no) * ratio * 2);
							}
							let center_vertices = [
								getCenterVertex(side_vertices, ratio),
								getCenterVertex(opposite_vertices, ratio)
							]

							let c1_uv_coords = [
								Math.lerp(face.uv[side_vertices[0]][0], face.uv[side_vertices[1]][0], ratio),
								Math.lerp(face.uv[side_vertices[0]][1], face.uv[side_vertices[1]][1], ratio),
							];
							let c2_uv_coords = [
								Math.lerp(face.uv[opposite_vertices[0]][0], face.uv[opposite_vertices[1]][0], ratio),
								Math.lerp(face.uv[opposite_vertices[0]][1], face.uv[opposite_vertices[1]][1], ratio),
							];

							let other_quad_vertex = side_vertices.find(vkey => !opposite_vertices.includes(vkey));
							let other_tri_vertex = side_vertices.find(vkey => opposite_vertices.includes(vkey));
							let new_face = new MeshFace(mesh, face).extend({
								vertices: [other_tri_vertex, center_vertices[0], center_vertices[1]],
								uv: {
									[other_tri_vertex]: face.uv[other_tri_vertex],
									[center_vertices[0]]: c1_uv_coords,
									[center_vertices[1]]: c2_uv_coords,
								}
							})
							if (new_face.getAngleTo(face) > 90) {
								new_face.invert();
							}
							face.extend({
								vertices: [opposed_vertex, center_vertices[0], center_vertices[1], other_quad_vertex],
								uv: {
									[opposed_vertex]: face.uv[opposed_vertex],
									[center_vertices[0]]: c1_uv_coords,
									[center_vertices[1]]: c2_uv_coords,
									[other_quad_vertex]: face.uv[other_quad_vertex],
								}
							})
							if (face.getAngleTo(new_face) > 90) {
								face.invert();
							}
							mesh.addFaces(new_face);

							// Multiple loop cuts
							if (cut_no+1 < cuts) {
								splitFace(face, [center_vertices[0], other_quad_vertex], double_side, cut_no+1);
							}

							if (cut_no != 0) return;
							// Find next (and previous) face
							for (let fkey in mesh.faces) {
								let ref_face = mesh.faces[fkey];
								if (ref_face.vertices.length < 3 || processed_faces.includes(ref_face)) continue;
								let vertices = ref_face.vertices.filter(vkey => opposite_vertices.includes(vkey))
								if (vertices.length >= 2) {
									splitFace(ref_face, opposite_vertices, ref_face.vertices.length == 4, 0);
									break;
								}
							}

							if (double_side) {
								for (let fkey in mesh.faces) {
									let ref_face = mesh.faces[fkey];
									if (ref_face.vertices.length < 3 || processed_faces.includes(ref_face)) continue;
									let vertices = ref_face.vertices.filter(vkey => side_vertices.includes(vkey))
									if (vertices.length >= 2) {
										let ref_sorted_vertices = ref_face.getSortedVertices();
										let ref_opposite_vertices = ref_sorted_vertices.filter(vkey => !side_vertices.includes(vkey));
										
										if (ref_opposite_vertices.length == 2) {
											splitFace(ref_face, ref_opposite_vertices, ref_face.vertices.length == 4, 0);
											break;
										}
									}
								}
							}
						} else {
							let opposite_vertex = sorted_vertices.find(vkey => !side_vertices.includes(vkey));

							let ratio = offset/length;
							if (cuts > 1) {
								ratio = 1 - (1 / (cuts + 1 - cut_no) * ratio * 2);
							}
							let center_vertex = getCenterVertex(side_vertices, ratio);

							let c1_uv_coords = [
								Math.lerp(face.uv[side_vertices[0]][0], face.uv[side_vertices[1]][0], ratio),
								Math.lerp(face.uv[side_vertices[0]][1], face.uv[side_vertices[1]][1], ratio),
							];

							let new_face = new MeshFace(mesh, face).extend({
								vertices: [side_vertices[1], center_vertex, opposite_vertex],
								uv: {
									[side_vertices[1]]: face.uv[side_vertices[1]],
									[center_vertex]: c1_uv_coords,
									[opposite_vertex]: face.uv[opposite_vertex],
								}
							})
							face.extend({
								vertices: [opposite_vertex, center_vertex, side_vertices[0]],
								uv: {
									[opposite_vertex]: face.uv[opposite_vertex],
									[center_vertex]: c1_uv_coords,
									[side_vertices[0]]: face.uv[side_vertices[0]],
								}
							})
							if (direction % 3 == 2) {
								new_face.invert();
								face.invert();
							}
							mesh.addFaces(new_face);
						}
					} else if (face.vertices.length == 2) {

						let ratio = offset/length;
						if (cuts > 1) {
							ratio = 1 - (1 / (cuts + 1 - cut_no) * ratio * 2);
						}
						let center_vertex = getCenterVertex(side_vertices, ratio);

						let c1_uv_coords = [
							Math.lerp(face.uv[side_vertices[0]][0], face.uv[side_vertices[1]][0], ratio),
							Math.lerp(face.uv[side_vertices[0]][1], face.uv[side_vertices[1]][1], ratio),
						];

						let new_face = new MeshFace(mesh, face).extend({
							vertices: [side_vertices[1], center_vertex],
							uv: {
								[side_vertices[1]]: face.uv[side_vertices[1]],
								[center_vertex]: c1_uv_coords,
							}
						})
						face.extend({
							vertices: [center_vertex, side_vertices[0]],
							uv: {
								[center_vertex]: c1_uv_coords,
								[side_vertices[0]]: face.uv[side_vertices[0]],
							}
						})
						mesh.addFaces(new_face);

						// Multiple loop cuts
						if (cut_no+1 < cuts) {
							splitFace(face, [center_vertex, side_vertices[0]], double_side, cut_no+1);
						}
					}
				}

				let start_vertices = start_face.getSortedVertices().filter((vkey, i) => selected_vertices.includes(vkey));

				// find start edge between start face and other selected face to determine loop direction
				selected_faces.remove(start_face);
				let aligned_edge = start_face.getEdges().find(edge => {
					return edge.allAre(vkey => selected_vertices.includes(vkey)) && selected_faces.find(face => face.vertices.includes(edge[0]) && face.vertices.includes(edge[1]))
				})
				if (aligned_edge) start_vertices = aligned_edge;

				let start_edge = [start_vertices[direction % start_vertices.length], start_vertices[(direction+1) % start_vertices.length]];
				if (start_edge.length == 1) start_edge.splice(0, 0, start_vertices[0]);

				splitFace(start_face, start_edge, start_face.vertices.length == 4 || direction > 2, 0);

				selected_vertices.empty();
				for (let key in center_vertices_map) {
					selected_vertices.safePush(center_vertices_map[key]);
				}
			})
			Undo.finishEdit('Create loop cut')
			Canvas.updateView({elements: Mesh.selected, element_aspects: {geometry: true, uv: true, faces: true}, selection: true})
		}

		runEdit();

		Undo.amendEdit({
			direction: {type: 'num_slider', value: 0, label: 'edit.loop_cut.direction', condition: !!selected_face, min: 0},
			cuts: {type: 'num_slider', value: 1, label: 'edit.loop_cut.cuts', min: 0, max: 16},
			offset: {type: 'num_slider', value: length/2, label: 'edit.loop_cut.offset', min: 0, /*max: length,*/ interval_type: 'position'},
			unit: {type: 'inline_select', label: 'edit.loop_cut.unit', options: {size: 'edit.loop_cut.unit.size_units', percent: 'edit.loop_cut.unit.percent'}},
		}, (form, form_options) => {
			let direction = form.direction || 0;
			length = getLength(direction);
			let offset = form.offset;
			if (form.unit == 'percent') {
				offset = (offset/100) * length;
			}
			if (!resolveMeshLength || form.unit === 'percent') offset = Math.clamp(offset, 0, length);

			if (saved_direction !== direction) {
				offset = length/2;
				form_options.setValues({offset}, false);
				saved_direction = direction;
			}
			
			runEdit(true, offset, direction, form.cuts, form.unit);
		})
}
